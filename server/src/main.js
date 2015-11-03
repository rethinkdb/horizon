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

var add_endpoint = function (endpoints, endpoint_name, check_fn, reql_fn, response_fn) {
  var endpoint = endpoints[endpoint_name];
  check(!endpoint);

  endpoint = new Object();
  endpoint.check_request = check_fn;
  endpoint.make_reql = reql_fn;
  endpoint.handle_response = response_fn;

  endpoints[endpoint_name] = endpoint;
};

var get_endpoint = function (endpoints, request) {
  var type = request.type;
  var options = request.options;

  check(type, `"type" must be specified.`);
  check(options, `"options" must be specified.`);

  var endpoint = endpoints[type];
  check(endpoint, `"${type}" is not a recognized endpoint"`);
  return endpoint;
};

// TODO: check for unknown fields
var check_read_request = function (request) {
  var type = request.type;
  var options = request.options;
  var collection = options.collection;
  var field_name = options.field_name;
  var selection = options.selection;
  var limit = options.limit;
  var order = options.order;

  check(collection, `"options.collection" must be specified.`);
  check(collection.constructor.name === "String",
        `"options.collection" must be a string.`)

  if (selection !== undefined) {
    var selection_type = selection.type;
    var selection_args = selection.args;
    check(selection_type, `"options.selection.type" must be specified.`);
    check(selection_args, `"options.selection.args" must be specified.`);
    check(selection_args.constructor.name === "Array", `"options.selection.args" must be an array.`)

    if (selection_type === "find_one") {
      check(selection_args.length === 1, `"options.selection.args" must have one argument for "find_one"`);
    } else if (selection_type === "find") {
    } else if (selection_type === "between") {
      check(selection_args.length === 2, `"options.selection.args" must have two arguments for "between"`);
    } else {
      check(false, `"options.selection.type" must be one of "find", "find_one", or "between".`)
    }
  }

  if (limit !== undefined) {
    check(ParseInt(limit) === limit, `"options.limit" must be an integer.`);
  }
  if (order !== undefined) {
    check(order === "ascending" || order === "descending",
          `"options.order" must be either "ascending" or "descending".`)
  }
};

var check_write_request = function (request) {
  var type = request.type;
  var options = request.options;
  var collection = options.collection;
  var data = options.data;

  check(collection, `"options.collection" must be specified.`);
  check(data, `"options.data" must be specified.`);
  check(data.id, `"options.data.id" must be specified.`);

  check(collection.constructor.name === "String",
        `"options.collection" must be a string.`)
};

class Query {
  constructor(request, endpoint) {
    this.request = request;
    this.endpoint = endpoint;
    endpoint.check_request(request);
    this.reql = endpoint.make_reql(request);
  }
};

var make_read_reql = function(request) {
  var type = request.type;
  var options = request.options;
  var index = options.field_name || "id"; // TODO: possibly require this to be specified
  var reql = r.table(options.collection);

  if (options.selection !== undefined) {
    if (options.selection.type === "find_one") {
      reql = reql.get(options.selection.args[0], {'index': index});
    } else if (options.selection.type === "find") {
      reql = reql.getAll.apply(reql, Array.concat(options.selection.args, {'index': index}));
    } else if (options.selection.type === "between") {
      reql = reql.between.apply(reql, Array.concat(options.selection.args, {'index': index}));
    }
  }

  if (options.order === "ascending") {
    reql = reql.orderBy({'index': r.asc(index)})
  } else if (options.order === "descending") {
    reql = reql.orderBy({'index': r.desc(index)})
  }

  if (options.limit !== undefined) {
    reql = reql.limit(options.limit);
  }

  if (type === "subscribe") {
    reql = reql.changes();
  }

  return reql;
};

var make_write_reql = function(request) {
  var type = request.type;
  var options = request.options;
  var reql = r.table(options.collection);

  // TODO: consider returnChanges: true
  if (type === "store_update") {
    reql = reql.insert(options.data, { 'conflict': 'update' });
  } else if (type === "store_replace") {
    reql = reql.insert(options.data, { 'conflict': 'replace' });
  } else if (type === "store_error") {
    reql = reql.insert(options.data, { 'conflict': 'error' });
  } else {
    reql = reql.get(options.data.id).delete();
  }

  return reql;
};

// TODO: separate handling for feeds - add 'synced' state
var handle_read_response = function(request, response, send_cb) {
  console.log(`Handling read response.`);
  if (response.constructor.name == 'Cursor' ||
      response.constructor.name == 'Feed') {
    response.each((err, item) => {
        console.log(`Cursor result: err ${JSON.stringify(err)}, item ${item}`);
        if (err) {
          send_cb({ 'error': `${err}` });
        } else {
          send_cb({ 'data': [item] });
        }
      }, () => send_cb({ 'data': [], 'state': 'complete' }));
  } else if (response.constructor.name == 'Array') {
    send_cb({ 'data': response });
  } else {
    send_cb({ "data": [response] });
  }
}

var handle_write_response = function(request, response, send_cb) {
  console.log(`Handling write response.`);
  if (response.errors !== 0) {
    send_cb({ 'error': response.first_error });
  }
  check(response.inserted + response.replaced + response.unchanged + response.skipped + response.deleted === 1,
        `Unexpected response counts: ${response}`);
  if (response.inserted === 1) {
    send_cb({ 'result': 'created' });
  } else if (request.type === 'store_update') {
    send_cb({ 'result': 'updated'});
  } else if (request.type === 'store_replace') {
    send_cb({ 'result': 'replaced'});
  } else if (response.deleted === 1) {
    send_cb({ 'result': 'removed' });
  } else {
    check(false, `Unexpected response counts: ${response}`)
  }
};

class Client {
  constructor(socket, reql_conn, endpoints, clients) {
    console.log('New client');

    this.socket = socket;
    this.reql_conn = reql_conn;
    this.endpoints = endpoints;
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
      check(request.request_id, `"request_id" must be specified.`);
    } catch (err) {
      console.log(`Client request resulted in error: ${err}`);
      return this.socket.close(1002, `Unparseable request: ${data}`);
    }

    try {
      check(this.check_permissions(request),
            `This session lacks the permissions to run ${data}.`);

      this.run_query(new Query(request, get_endpoint(this.endpoints, request)));
    } catch (err) {
      this.send_response({'request': request}, { 'error': `${err}` });
    }
  }

  run_query(query) {
      var conn = this.reql_conn.get_connection();
      check(conn, `Connection to the database is down.`);
      console.log(`Running ${JSON.stringify(query.reql.build())}`);
      query.reql.run(conn)
        .then((res) => this.handle_response(query, res))
        .catch((err) => this.handle_response_error(query, err));
  }

  run_query_prerequisite(query, root_term) {
      var conn = this.reql_conn.get_connection();
      check(conn, `Connection to the database is down.`);
      console.log(`Running [${root_term.build()}]`);
      root_term.run(conn)
        .then((res) => this.rundata(query))
        .catch((err) => this.handle_response_error(query, err));
  }

  handle_response(query, res) {
    console.log(`Got result ${res} for ${query.request.request_id} - ${query.request.type}`);
    try {
      query.endpoint.handle_response(query.request, res, (data) => this.send_response(query, data));
    } catch (err) {
      console.log(`Error when handling response: ${err}`);
      this.send_response(query, { 'error': `${err}` });
    }
  }

  send_response(query, data) {
    console.log(`Sending response for ${query}: ${data}.`);
    data.request_id = query.request.request_id;
    console.log(`Sending response for ${query.request.request_id}: ${data}`);
    this.socket.send(JSON.stringify(data));
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

    var response = { 'request_id': query.request.request_id,
                     'error': info.msg,
                     'error_code': 0 };
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
  var endpoints = new Object();
  var clients = new Set();

  add_endpoint(endpoints, "subscribe", check_read_request, make_read_reql, handle_read_response);
  add_endpoint(endpoints, "query", check_read_request, make_read_reql, handle_read_response);

  add_endpoint(endpoints, "store_error", check_write_request, make_write_reql, handle_write_response);
  add_endpoint(endpoints, "store_update", check_write_request, make_write_reql, handle_write_response);
  add_endpoint(endpoints, "store_replace", check_write_request, make_write_reql, handle_write_response);
  add_endpoint(endpoints, "remove", check_write_request, make_write_reql, handle_write_response);

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
  websocket_server.on('connection', (socket) => new Client(socket, reql_conn, endpoints, clients));
};

main();
