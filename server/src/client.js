'use strict';

const error = require('./error.js');
const r = require('rethinkdb');

var check = error.check;

class Query {
  constructor(request, endpoint) {
    this.request = request;
    this.endpoint = endpoint;
    this.reql = endpoint.make_reql(request);
  }
}

module.exports.Client = class Client {
  constructor(socket, parent_server) {
    console.log('New client');

    this.socket = socket;
    this.parent = parent_server;
    this.cursors = new Set();

    this.socket.on('open', () => this.handle_open());
    this.socket.on('close', (code, msg) => this.handle_close(code, msg));
    this.socket.on('error', (error) => this.handle_websocket_error(error));
    this.socket.on('message', (data, flags) => this.handle_handshake(data));
  }

  handle_open() {
    console.log(`Client connection established.`);
    this.parent._clients.add(this);
  }

  handle_handshake(data) {
    // TODO: implement handshake
    this.socket.removeAllListeners('message');
    this.socket.on('message', (data, flags) => this.handle_request(data));
    this.socket.send(JSON.stringify({ user_id: 0 }));
  }

  handle_close() {
    console.log(`Client connection terminated.`);
    this.parent._clients.delete(this);
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

      this.run_query(new Query(request, this.parent._get_endpoint(request)));
    } catch (err) {
      this.send_response({ request: request }, { error: `${err}` });
    }
  }

  run_query(query) {
      var conn = this.parent._reql_conn.get_connection();
      check(conn !== undefined, `Connection to the database is down.`);
      console.log(`Running ${r.Error.printQuery(query.reql)}`);

      query.reql.run(conn).then((res) => this.handle_response(query, res),
		                (err) => this.handle_response_error(query, err));
  }

  run_query_prerequisite(query, root_term) {
      var conn = this.parent._reql_conn.get_connection();
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
      this.send_response(query, { error: `${err}` });
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

    var response = { request_id: query.request.request_id,
                     error: info.msg,
                     error_code: 0 };
    this.socket.send(JSON.stringify(response));
  }

  reql_connection_lost() {
    // TODO: notify client, other cleanup
  }

  check_permissions() {
    return true;
  }
}
