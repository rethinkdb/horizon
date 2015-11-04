const websocket = require('ws'),
 http = require('http'),
 https = require('https'),
 r = require('rethinkdb'),
 fs = require('fs'),
 url = require('url'),
 path = require('path'),
 nopt = require('nopt');

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

var fail = function (message) {
  check(false, message);
};

var add_endpoint = function (endpoints, endpoint_name, make_reql, handle_response) {
  check(endpoints.get(endpoint_name) === undefined);
  endpoints.set(endpoint_name, { make_reql: make_reql, handle_response: handle_response });
};

var get_endpoint = function (endpoints, request) {
  var type = request.type;
  var options = request.options;

  check(type !== undefined, `'type' must be specified.`);
  check(options !== undefined, `'options' must be specified.`);

  var endpoint = endpoints.get(type);
  check(endpoint !== undefined, `'${type}' is not a recognized endpoint`);
  return endpoint;
};

class Query {
  constructor(request, endpoint) {
    this.request = request;
    this.endpoint = endpoint;
    this.reql = endpoint.make_reql(request);
  }
};

// TODO: check for unknown fields
var make_read_reql = function(request) {
  var type = request.type;
  var options = request.options;
  var collection = options.collection;
  var index = options.field_name || 'id'; // TODO: possibly require this to be specified

  check(collection !== undefined, `'options.collection' must be specified.`);
  check(collection.constructor.name === 'String',
        `'options.collection' must be a string.`)

  var reql = r.table(collection);

  var selection = options.selection;
  if (selection !== undefined) {
    var selection_type = selection.type;
    var selection_args = selection.args;
    check(selection_type !== undefined, `'options.selection.type' must be specified.`);
    check(selection_args !== undefined, `'options.selection.args' must be specified.`);
    check(selection_args.constructor.name === 'Array', `'options.selection.args' must be an array.`)

    if (selection_type === 'find_one') {
      check(selection_args.length === 1, `'options.selection.args' must have one argument for 'find_one'`);
      reql = reql.get(selection_args[0], {'index': index});
    } else if (selection_type === 'find') {
      reql = reql.getAll.apply(reql, selection_args.concat({'index': index}));
    } else if (selection_type === 'between') {
      check(selection_args.length === 2, `'options.selection.args' must have two arguments for 'between'`);
      reql = reql.between.apply(reql, selection_args.concat({'index': index}));
    } else {
      fail(`'options.selection.type' must be one of 'find', 'find_one', or 'between'.`)
    }
  }

  var order = options.order;
  if (order === 'ascending') {
    reql = reql.orderBy({'index': r.asc(index)})
  } else if (order === 'descending') {
    reql = reql.orderBy({'index': r.desc(index)})
  } else if (order !== undefined) {
    fail(`'options.order' must be either 'ascending' or 'descending'.`);
  }

  var limit = options.limit;
  if (limit !== undefined) {
    check(parseInt(limit) === limit, `'options.limit' must be an integer.`);
    reql = reql.limit(limit);
  }

  if (type === 'subscribe') {
    reql = reql.changes({ 'include_states': true });
  }

  return reql;
};

var handle_cursor = function(client, cursor, send_cb) {
  client.cursors.add(cursor);
  cursor.each((err, item) => {
      if (err !== null) {
        send_cb({ 'error': `${err}` });
      } else {
        send_cb({ 'data': [item] });
      }
    }, () => send_cb({ 'data': [], 'state': 'complete' }));
};

var handle_feed = function(client, feed, send_cb) {
  client.cursors.add(feed);
  feed.each((err, item) => {
      if (err !== null) {
        send_cb({ 'error': `${err}` });
      } else if (item.state === 'initializing') {
        // Do nothing - we don't care
      } else if (item.state === 'ready') {
        send_cb({ 'state': 'synced' });
      } else {
        send_cb({ 'data': [item] });
      }
    }, () => send_cb({ 'data': [], 'state': 'complete' }));
};

var handle_read_response = function(client, request, response, send_cb) {
  if (request.type === 'query') {
    if (response.constructor.name === 'Cursor') {
      handle_cursor(client, response, send_cb);
    } else if (response.constructor.name === 'Array') {
      send_cb({ 'data': response });
    } else {
      send_cb({ 'data': [response] });
    }
  } else {
    handle_feed(client, response, send_cb);
  }
}

var make_write_reql = function(request) {
  var type = request.type;
  var options = request.options;
  var collection = options.collection;
  var data = options.data;

  check(data !== undefined, `'options.data' must be specified.`);
  check(collection !== undefined, `'options.collection' must be specified.`);
  check(collection.constructor.name === 'String',
        `'options.collection' must be a string.`)

  var reql = r.table(collection);

  if (type === 'store_update') {
    reql = reql.insert(data, { 'conflict': 'update', 'returnChanges': true });
  } else if (type === 'store_replace') {
    reql = reql.insert(data, { 'conflict': 'replace', 'returnChanges': true });
  } else if (type === 'store_error') {
    reql = reql.insert(data, { 'conflict': 'error', 'returnChanges': true });
  } else {
    check(data.id !== undefined, `'options.data.id' must be specified for 'remove'.`);
    reql = reql.get(data.id).delete({ 'returnChanges': true });
  }

  return reql;
};

var handle_write_response = function(client, request, response, send_cb) {
  console.log(`Handling write response.`);
  if (response.errors !== 0) {
    send_cb({ 'error': response.first_error });
  } else if (response.changes.length === 1) {
    send_cb({ 'data': response.changes[0] });
  } else if (response.unchanged === 1) {
    send_cb({ 'data': { 'old_val': request.data, 'new_val': request.data } });
  } else if (response.skipped === 1) {
    send_cb({ 'data': { 'old_val': null, 'new_val': null } });
  } else {
    fail(`Unexpected response counts: ${JSON.stringify(response)}`);
  }
};

class Client {
  constructor(socket, reql_conn, endpoints, clients) {
    console.log('New client');

    this.socket = socket;
    this.reql_conn = reql_conn;
    this.endpoints = endpoints;
    this.clients = clients;
    this.cursors = new Set();

    this.socket.on('open', () => this.handle_open());
    this.socket.on('close', (code, msg) => this.handle_close(code, msg));
    this.socket.on('error', (error) => this.handle_websocket_error(error));
    this.socket.on('message', (data, flags) => this.handle_handshake(data));
  }

  handle_open() {
    console.log(`Client connection established.`);
    this.clients.add(this);
  }

  handle_handshake(data) {
    // TODO: implement handshake
    this.socket.removeAllListeners('message');
    this.socket.on('message', (data, flags) => this.handle_request(data));
    this.socket.send(JSON.stringify({ 'user_id': 0 }));
  }

  handle_close() {
    console.log(`Client connection terminated.`);
    this.clients.delete(this);
    this.cursors.forEach((cursor) => cursor.close());
  }

  handle_websocket_error(code, msg) {
    console.log(`Received error from client: ${msg} (${code})`);
  }

  handle_request(data) {
    console.log(`Received request from client: ${data}`);
    var request;
    var query;

    try {
      request = JSON.parse(data);
      check(request.request_id !== undefined, `'request_id' must be specified.`);
    } catch (err) {
      console.log(`Failed to parse client request: ${err}`);
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
      check(conn !== undefined, `Connection to the database is down.`);
      console.log(`Running ${r.Error.printQuery(query.reql)}`);

      query.reql.run(conn).then((res) => this.handle_response(query, res),
		                (err) => this.handle_response_error(query, err));
  }

  run_query_prerequisite(query, root_term) {
      var conn = this.reql_conn.get_connection();
      check(conn !== undefined, `Connection to the database is down.`);
      console.log(`Running ${r.Error.printQuery(root_term)}`);

      root_term.run(conn).then((res) => this.run_query(query),
                               (err) => this.handle_response_error(query, err));
  }

  handle_response(query, res) {
    console.log(`Got result ${res} for ${query.request.request_id} - ${query.request.type}`);
    try {
      query.endpoint.handle_response(this, query.request, res, (data) => this.send_response(query, data));
    } catch (err) {
      console.log(`Error when handling response: ${err}`);
      this.send_response(query, { 'error': `${err}` });
    }
  }

  send_response(query, data) {
    data.request_id = query.request.request_id;
    console.log(`Sending response: ${JSON.stringify(data)}`);
    this.socket.send(JSON.stringify(data));
  }

  handle_response_error(query, info) {
    var matches;
    // We may have already tried to create a table or index while it was already
    // being created, recognize those errors and retry.
    if (info.msg.match(/Database `w+` already exists\./) ||
        info.msg.match(/Table `w+\.w+` already exists\./) ||
        info.msg.match(/Index `w+` already exists on table `w+\.w+`\./)) {
      this.run_query(query);
    }

    // If the index or table is still building, wait on them
    matches = info.msg.match(/Table `\w+\.(\w+)` is not ready\./); // TODO: get real error message
    if (matches !== null && matches.length === 2) {
      console.log(`WARNING: waiting for table to be ready: '${matches[1]}'`);
      return this.run_query_prerequisite(query,
        r.table(String(matches[1])).wait());
    }

    matches = info.msg.match(/Index `(\w+)` on table `\w+\.(\w+)` was accessed before its construction was finished\./);
    if (matches !== null && matches.length === 3) {
      console.log(`WARNING: waiting for index to be ready: '${matches[2]}:${matches[1]}'`);
      return this.run_query_prerequisite(query,
        r.table(String(matches[2])).indexWait(String(matches[1])));
    }

    // If a db, table, or index used does not exist, we must create them
    matches = info.msg.match(/Database `(\w+)` does not exist\./);
    if (matches != null && matches.length == 2) {
      console.log(`WARNING: creating missing db: '${matches[1]}'`);
      return this.run_query_prerequisite(query,
        r.dbCreate(String(matches[1])));
    }

    matches = info.msg.match(/Table `\w+\.(\w+)` does not exist\./);
    if (matches !== null && matches.length === 2) {
      console.log(`WARNING: creating missing table: '${matches[1]}'`);
      return this.run_query_prerequisite(query,
        r.tableCreate(String(matches[1])));
    }

    matches = info.msg.match(/Index `(\w+)` was not found on table `\w+\.(\w+)`\./);
    if (matches !== null && matches.length === 3) {
      console.log(`WARNING: creating missing index: '${matches[2]}:${matches[1]}'`);
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
// This will require tying cursors to certain connections
class ReqlConnection {
  constructor(host, port, clients) {
    this.host = host;
    this.port = port;
    this.db = 'fusion'; // TODO: configurable DB
    this.clients = clients;
    this.connection = null;
    this.reconnect_delay = 0;
    this.reconnect();
  }

  reconnect() {
    console.log(`Connecting to RethinkDB: ${this.host}:${this.port}`);
    r.connect({ 'host': this.host, 'port': this.port, 'db': this.db })
     .then(conn => this.handle_conn_success(conn))
     .catch(err => this.handle_conn_error(err));
  }

  handle_conn_success(conn) {
    console.log(`Connection to RethinkDB established.`);
    this.connection = conn;
    this.reconnect_delay = 0;
    this.connection.on('error', (err) => this.handle_conn_error(err));
  }

  handle_conn_error(err) {
    console.log(`Connection to RethinkDB terminated: ${err}`);
    if (!this.connection) {
      this.connection = null;
      this.clients.forEach((client) => client.reql_connection_lost());
      setTimeout(() => this.reconnect(), this.reconnect_delay);
      this.reconnect_delay = Math.min(this.reconnect_delay + 100, 1000);
    }
  }

  get_connection() {
    return this.connection;
  }
}

//Function which handles just the /fusion.js endpoint
var handle_http_request = function(req, res) {
  const reqPath = url.parse(req.url).pathname;
  const filePath = path.resolve('../client/dist/build.js');

  if (reqPath === '/fusion.js') {
    fs.access(filePath,
    fs.R_OK | fs.F_OK,
    function (exists) {
        // Check if file exists
        if (exists) {
          res.writeHead('404', {'Content-Type': 'text/plain'});
          res.write('Client library not found\n');
          res.end();return;
        }

        // filePath exists now just need to read from it.
        fs.readFile(filePath, 'binary', function (err, file) {
            // Error while reading from file
            if (err) {
              res.writeHead(500, {'Content-Type': 'text/plain'});
              res.write(err + '\n');
              res.end();return;
            }

            // File successfully read, write contents to response
            res.writeHead(200);
            res.write(file, 'binary');
            res.end();return;
          });

      });
  } else {
    res.writeHead('403', {'Content-Type': 'text/plain'});
    res.write('Forbidden');
    res.end();
  }
};

var main = function(local_hosts, local_port, rdb_host, rdb_port, unsafe, key_file, cert_file) {
  var endpoints = new Map();
  var servers = new Set();
  var clients = new Set();
  var reql_conn = new ReqlConnection(rdb_host, rdb_port, clients);

  add_endpoint(endpoints, 'subscribe', make_read_reql, handle_read_response);
  add_endpoint(endpoints, 'query', make_read_reql, handle_read_response);
  add_endpoint(endpoints, 'store_error', make_write_reql, handle_write_response);
  add_endpoint(endpoints, 'store_update', make_write_reql, handle_write_response);
  add_endpoint(endpoints, 'store_replace', make_write_reql, handle_write_response);
  add_endpoint(endpoints, 'remove', make_write_reql, handle_write_response);

  local_hosts.forEach((host) => {
      var http_server;
      if (unsecure) {
         http_server = new http.Server(handle_http_request);
      } else {
         http_server = new https.Server({ key: fs.readFileSync(key_file),
                                          cert: fs.readFileSync(cert_file) }, handle_http_request);
      }
      http_server.listen(local_port, host);

      servers.add(new websocket.Server({ server: http_server,
                                         handleProtocols: accept_protocol })
        .on('error', (error) => console.log(`Websocket server error: ${error}`))
        .on('connection', (socket) => new Client(socket, reql_conn, endpoints, clients)));
    });
};

// TODO: persistent config
var parsed = new nopt({ bind: [String, Array], port: Number, connect: String, unsecure: Boolean, key_file: path, cert_file: path });
var print_usage = function () {
  console.log('Usage: node fusion.js [OPTIONS]');
  console.log('');
  console.log('  --bind HOST            local hostname to serve fusion on (repeatable)');
  console.log('  --port PORT            local port to serve fusion on');
  console.log('  --connect HOST:PORT    host and port of the RethinkDB server to connect to');
  console.log('  --unsecure             serve unsecure websockets, ignore --key-file and --cert-file');
  console.log('  --key-file PATH        path to the key file to use, defaults to ./key.pem');
  console.log('  --cert-file PATH       path to the cert file to use, defaults to ./cert.pem');
  console.log('');
};

if (parsed.help) {
  print_usage();
  process.exit(0);
} else if (parsed.argv.remain.length !== 0) {
  // TODO: nopt doesn't let us discover extra '--flag' options - choose a new library
  console.log(`Unrecognized argument: ${parsed.argv.remain[0]}`);
  print_usage();
  process.exit(0);
}

var local_hosts = new Set(['localhost']);
var local_port = 31420;
var rdb_host = 'localhost';
var rdb_port = 28015;
var unsecure = !!parsed.unsecure;
var key_file = './key.pem';
var cert_file = './cert.pem';

if (parsed.bind !== undefined) {
  parsed.bind.forEach((item) => local_hosts.add(item));
}

if (parsed.port !== undefined) {
  local_port = parsed.port;
}

if (parsed.connect !== undefined) {
  var host_port = parsed.connect.split(':');
  if (host_port.length === 1) {
    rdb_host = host_port[0];
  } else if (host_port.length === 2) {
    rdb_host = host_port[0];
    rdb_port = host_port[1];
  } else {
    console.log(`Expected --connect HOST:PORT, but found "${parsed.connect}"`);
    print_usage();
    process.exit(1);
  }
}

if (parsed.key_file !== undefined) {
  key_file = parsed.key_file;
}

if (parsed.cert_file !== undefined) {
  cert_file = parsed.cert_file;
}

main(local_hosts, local_port, rdb_host, rdb_port, unsecure, key_file, cert_file);
