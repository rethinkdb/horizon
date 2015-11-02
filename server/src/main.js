var websocket = require('ws');
var https = require('https');
var r = require('rethinkdb');
var fs = require('fs');

//var accept_client = function (info, cb) {
  // TODO: parse out the auth parameters from info['req'], and pass them through the
  // selected auth method
  // Might not be able to do this here - we may need to create a temporary user which must be
  // associated with the Client object which does not exist yet

  // Response: <bool> (accepted or not), <int> (http status code), <string> (http reason phrase)
  //cb(true, null, null);
//};

var accept_protocol = function (protocols, cb) {
  if (protocols.findIndex(x => x === 'rethinkdb-fusion-v0') != -1) {
    cb(true, 'rethinkdb-fusion-v0');
  } else {
    console.log(`Rejecting client without 'rethinkdb-fusion-v0' protocol: ${protocols}`);
    cb(false, null);
  }
};

var check = function (pred, message) {
  if (!pred) {
    throw message;
  }
};

var check_request = function (request) {
  var args;
  check(request.type, `"type" must be specified.`);
  check(request.data, `"data" must be specified.`);
  check(request.data.path, `"data.path" must be specified.`);
  check(request.data.path.collection, `"data.path.collection" must be specified.`);

  var path = request.data.path;

  if (args = path.findOne) {
    check(args.constructor.name === 'Array',
          `"findOne" must have an array of arguments.`);
    check(args.length === 1 || args.length === 2,
          `"findOne" has ${args.length} arguments, but it should have 1.`);
    check(path.keys().length === 2,
          `"findOne" cannot be used with other terms.`);
  } else {
    var index;

    if (args = path.find) {
      check(args.constructor.name === 'Array',
            `"find" must have an array of arguments.`);
      check(args.length === 1 || args.length === 2,
            `"find" has ${args.length} arguments, but it should have 1 or 2.`);
      check(!path.between,
            `Must specify zero or one of "find", "findOne", and "between".`);
      if (args.length === 2) { index = args[0]; }
    }

    if (args = path.between) {
      check(args.constructor.name === 'Array',
            `"between" must have an array of arguments.`);
      check(args.length === 2 || args.length === 3,
            `"between" has ${args.length} arguments, but it should have 2 or 3.`);
      check(!path.find,
            `Must specify zero or one of "find", "findOne", and "between".`);
      if (args.length === 3) { index = args[0]; }
    }

    if (args = path.order) {
      check(args.constructor.name === 'Array',
            `"order" must have an array of arguments.`);
      check(args.length === 2,
            `"order" has ${args.length} arguments, but it should have 2.`);
      check(!index || index === args[0],
            `"order" uses index ${args[0]}, but an earlier term uses ${index}.`);
    }

    if (args = path.limit) {
      check(args.constructor.name === 'Array',
            `"limit" must have an array of arguments.`);
      check(args.length === 1,
            `"limit" has ${args.length} arguments, but it should have 1.`);
    }
  }
};

class Query {
  constructor(request) {
    this.request = request;

    check_request(request);

    var query = this.parse_path();
    if (this.request.type === 'SUBSCRIBE') {
      query = query.changes();
    } else if (this.request.type === 'REMOVE') {
      query = query.delete({ 'returnChanges': true });
    } else if (this.request.type === 'STORE_REPLACE') {
      query = query.insert(request.data.data, { 'conflict': 'replace', 'returnChanges': true });
    } else if (this.request.type === 'STORE_ERROR') {
      query = query.insert(request.data.data, { 'conflict': 'error', 'returnChanges': true });
    } else if (this.request.type === 'UPDATE') {
      query = query.insert(request.data.data, { 'conflict': 'update', 'returnChanges': true });
    } else if (this.request.type === 'QUERY') {
      // Do nothing
    }
    this.reql_query = query;
  }

  parse_path() {
    var args;
    var path = this.request.data.path
    var query = r.table(path.collection);

    if (args = path.findOne) {
      query = query.get(args);
    }
    if (args = path.find) {
      query = query.getAll(args);
    }
    if (args = path.between) {
      if (args.length === 2) {
        query = query.between(args[0], args[1]);
      } else {
        query = query.between(args[0], args[1], { 'index': args[2] });
      }
    }

    if (args = path.order) {
      if (args[1] === 'descending') {
        query = query.orderBy({ 'index': r.desc(args[0]) });
      } else {
        query = query.orderBy({ 'index': args[0] });
      }
    }

    if (args = path.limit) {
      query = query.limit(args);
    }

    return query;
  }
}

class Client {
  constructor(socket, reql_conn, clients) {
    console.log('New client');

    this.socket = socket;
    this.reql_conn = reql_conn;
    this.clients = clients;
    this.feeds = new Set();

    this.socket.on('open', () => this.handle_open());
    this.socket.on('close', (code, msg) => this.handle_close(code, msg));
    this.socket.on('error', (error) => this.handle_websocket_error(error));
    this.socket.on('message', (data, flags) => this.handle_request(data));
  }

  handle_open() {
    console.log(`Client connection established.`);
    this.clients.add(this);
  }

  handle_close() {
    console.log(`Client connection terminated.`);
    this.clients.delete(this);
    this.feeds.forEach((feed) => feed.close());
  }

  handle_websocket_error(code, msg) {
    console.log(`Client received error: ${msg} (${code})`);
  }

  handle_request(data) {
    console.log(`Client received request: ${data}`);
    var request;
    var query;

    try {
      request = JSON.parse(data);
      check(request.requestId, `"requestId" must be specified.`);
    } catch (err) {
      console.log(`Client request resulted in error: ${err}`);
      return this.socket.close(1002, `Unparseable request: ${data}`);
    }

    try {
      var query = new Query(request);

      check(this.check_permissions(request),
            `This session lacks the permissions to run ${data}.`);

      this.run_query(query);
    } catch (err) {
      this.send_response({'request': request}, { 'error': `${err}` });
    }
  }

  run_query(query) {
      var conn = this.reql_conn.get_connection();
      check(conn, `Connection to the database is down.`);
      console.log(`Running ${JSON.stringify(query.reql_query.build())}`);
      query.reql_query.run(conn)
        .then((res) => this.handle_response(query, res))
        .catch((err) => this.handle_response_error(query, err));
  }

  run_query_prerequisite(query, root_term) {
      var conn = this.reql_conn.get_connection();
      check(conn, `Connection to the database is down.`);
      console.log(`Running [${root_term.build()}]`);
      root_term.run(conn)
        .then((res) => this.run_query(query))
        .catch((err) => this.handle_response_error(query, err));

  }

  handle_response(query, res) {
    console.log(`Got result ${res} for ${query.request.requestId} - ${query.request.type}`);
    try {
      if (query.request.type === 'SUBSCRIBE') {
        check(res.constructor.name === 'Feed', `Got a non-feed back for a subscribe query.`);
        this.handle_cursor_response(query, res);
      } else if (query.request.type === 'REMOVE') {
        check(res.errors === 0, `Got an error result for a remove query: ${res}`);
        this.send_response(query, { 'data': res.changes });
      } else if (query.request.type === 'STORE_REPLACE') {
        check(res.errors === 0, `Got an error result for a replace query: ${res}`);
        this.send_response(query, { 'data': res.changes });
      } else if (query.request.type === 'STORE_ERROR') {
        if (res.errors === 0) {
          this.send_response(query, { 'data': res.changes });
        } else {
          this.send_response(query, { 'data': res.first_error });
        }
      } else if (query.request.type === 'UPDATE') {
        check(res.errors === 0, `Got an error result for an update query: ${res}`);
        this.send_response(query, { 'data': res.changes });
      } else if (query.request.type === 'QUERY') {
        if (res.constructor.name == 'Cursor') {
          this.handle_cursor_response(query, res);
        } else if (res.constructor.name == 'Array') {
          this.send_response(query, { 'data': res });
        } else {
          this.send_response(query, { 'data': [res] });
        }
      } else {
        check(false, `Unknown query request type.`);
      }
    } catch (err) {
      console.log(`Error when handling response: ${res}`);
      this.send_response(query, { 'error': `${res}` });
    }
  }

  handle_cursor_response(query, cursor) {
    cursor.each((err, data) => {
        console.log(`Cursor result: err ${JSON.stringify(err)}, data ${data}`);
        if (err) {
          this.send_response(query, { 'error': `${err}` });
        } else {
          this.send_response(query, { 'data': [data] })
        }
      }, () => this.send_response(query, { 'state': 'finished' }));
  }

  send_response(query, info) {
    info.requestId = query.request.requestId;
    console.log(`Sending response for ${query.request.requestId}: ${info}`);
    this.socket.send(JSON.stringify(info));
  }

  handle_response_error(query, info) {
    var matches;
    // We may have already tried to create a table or index while it was already
    // being created, recognize those errors and retry.
    if (info.msg.match(/Table `w+\.w+` already exists\./) ||
        info.msg.match(/Index `w+` already exists on table `w+\.w+`\./)) {
      this.run_query(query);
    }

    // If the index or table is still building, wait on them
    matches = info.msg.match(/Table `\w+\.(\w+)` is not ready\./); // TODO: get real error message
    console.log(`Error matches table not ready: ${matches}`);
    if (matches !== null && matches.length === 2) {
      console.log(`Waiting for table '${matches[1]}'`);
      return this.run_query_prerequisite(query,
        r.table(String(matches[1])).wait());
    }

    matches = info.msg.match(/Index `(\w+)` on table `\w+\.(\w+)` was accessed before its construction was finished\./);
    console.log(`Error matches index not ready: ${matches}`);
    if (matches !== null && matches.length === 3) {
      console.log(`Waiting for index '${matches[2]}:${matches[1]}'`);
      return this.run_query_prerequisite(query,
        r.table(String(matches[2])).indexWait(String(matches[1])));
    }

    // If a db, table, or index used does not exist, we must create them
    matches = info.msg.match(/Database `(\w+)` does not exist\./);
    console.log(`Error matches database missing: ${matches}`);
    if (matches != null && matches.length == 2) {
      console.log(`Creating missing db '${matches[1]}'`);
      return this.run_query_prerequisite(query,
        r.dbCreate(String(matches[1])));
    }

    matches = info.msg.match(/Table `\w+\.(\w+)` does not exist\./);
    console.log(`Error matches table missing: ${matches}`);
    if (matches !== null && matches.length === 2) {
      console.log(`Creating missing table '${matches[1]}'`);
      return this.run_query_prerequisite(query,
        r.tableCreate(String(matches[1])));
    }

    matches = info.msg.match(/Index `(\w+)` was not found on table `\w+\.(\w+)`\./);
    console.log(`Error matches index missing: ${matches}`);
    if (matches !== null && matches.length === 3) {
      console.log(`Creating missing index '${matches[2]}:${matches[1]}'`);
      return this.run_query_prerequisite(query,
        r.table(String(matches[2])).indexCreate(String(matches[1])));
    }

    var response = { 'requestId': query.request.requestId,
                     'error': info.msg };
    this.socket.send(JSON.stringify(response));
  }

  reql_connection_lost() {
    // TODO: notify client, other cleanup
  }

  check_permissions() {
    return true;
  }
}

// TODO: have a pool of connections to different servers?
// This will require tying feeds to certain connections
class ReqlConnection {
  constructor(host, port, clients) {
    this.host = host;
    this.port = port;
    this.db = 'fusion'; // TODO: configurable DB
    this.clients = clients;
    this.connection = null;
    this.reconnect_delay = 0.1;
    this.reconnect();
  }

  reconnect() {
    console.log(`Connecting to RethinkDB: ${this.host}`);
    r.connect({ 'host': this.host, 'port': this.port, 'db': this.db })
     .then(conn => this.handle_conn_success(conn))
     .catch(err => this.handle_conn_error(err));
  }

  handle_conn_success(conn) {
    console.log(`Connection to RethinkDB established.`);
    this.connection = conn;
    this.connection.on('error', (err) => this.handle_conn_error(err));
  }

  handle_conn_error(err) {
    console.log(`Connection to RethinkDB terminated: ${err}`);
    if (!this.connection) {
      this.connection = null;
      this.clients.forEach((client) => client.reql_connection_lost());
      setTimeout(() => this.reconnect(), this.reconnect_delay);
    }
  }

  get_connection() {
    return this.connection;
  }
}

var main = function() {
  var clients = new Set();

  // TODO: need some persistent configuration of rethinkdb server(s) to connect to
  var reql_conn = new ReqlConnection('newton', 59435, clients);

  // TODO: need some persistent configuration for hostname/ports to listen on, as well as certificate config
  var https_server = new https.Server(
    { 'key': fs.readFileSync('./key.pem'),
      'cert': fs.readFileSync('./cert.pem')
    }).listen(31420, 'localhost');

  var websocket_server = new websocket.Server(
    { 'server': https_server,
      //'verifyClient': verify,
      'handleProtocols': accept_protocol });

  websocket_server.on('error', (error) => console.log(`Websocket server error: ${error}`));
  websocket_server.on('connection', (socket) => new Client(socket, reql_conn, clients));
};

main();
