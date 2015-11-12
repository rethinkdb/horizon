'use strict';

const { check } = require('./error');
const logger = require('./logger');

const r = require('rethinkdb');
const websocket = require('ws');

class Request {
  constructor(client, raw_request) {
    this.client = client;
    this.raw = raw_request;
    this.id = this.raw.request_id;
    this.endpoint = client.parent._get_endpoint(this.raw);
    this.reql = this.endpoint.make_reql(this.raw);
    this.start_time = Date.now();
  }
  // TODO: add functions for endpoint access:
  //   - add_cursor(cursor) - adds a cursor to be tracked (and closed on disconnection)
  //   - remove_cursor(cursor) - removes a cursor from being tracked
  //     - for these, we should probably change cursors to a Map of request_id -> Set of cursors
  //   - handle_error(err) - use default error handling
  //     - in dev mode, this will automatically create/wait for dbs, tables, indexes
  //     - in release mode, this will just pass the error back to the client
  // TODO: should we allow user-defined endpoints to run multiple reql queries?
  //   perhaps give them a callback for it, rather than returning the reql
}

class Client {
  constructor(socket, parent_server) {
    this.socket = socket;
    this.parent = parent_server;
    this.cursors = new Map();

    this.socket.on('open', () => this.handle_open());
    this.socket.on('close', (code, msg) => this.handle_close(code, msg));
    this.socket.on('error', (error) => this.handle_websocket_error(error));
    this.socket.once('message', (data) => this.handle_handshake(data));
  }

  handle_open() {
    logger.debug(`Client connection established.`);
    this.parent._clients.add(this);
  }

  handle_close() {
    logger.debug(`Client connection terminated.`);
    this.parent._clients.delete(this);
    this.cursors.forEach((cursor) => cursor.close());
  }

  handle_websocket_error(code, msg) {
    logger.error(`Received error from client: ${msg} (${code})`);
  }

  parse_raw_request(data) {
    try {
      var request = JSON.parse(data);
      check(request.request_id !== undefined, `"request_id" is required`);
      return request;
    } catch (err) {
      logger.debug(`Failed to parse client request: ${err}`);
      this.socket.close(1002, `Unparseable request: ${data}`);
    }
  }

  handle_handshake(data) {
    logger.debug(`Got handshake request: ${data}`);
    // TODO: implement handshake
    this.socket.on('message', (msg) => this.handle_request(msg));
    var raw_request = this.parse_raw_request(data);

    if (raw_request !== undefined) {
      this.send_response({ id: raw_request.request_id }, { user_id: 0 });
    }
  }

  handle_request(data) {
    logger.debug(`Received request from client: ${data}`);
    var raw_request = this.parse_raw_request(data);

    if (raw_request !== undefined) {
      if (raw_request.type === 'end_subscription') {
        return this.end_subscription(raw_request); // there is no response for end_subscription
      }

      try {
        check(this.check_permissions(raw_request),
              `This session lacks the permissions to run ${data}.`);
        this.run_request(new Request(this, raw_request));
      } catch (err) {
        this.send_response({ id: raw_request.request_id }, { error: err.message });
      }
    }
  }

  end_subscription(raw_request) {
    var cursor = this.cursors.delete(raw_request.request_id);
    if (cursor !== undefined) {
      cursor.close();
    }
  }

  run_request(request) {
      var conn = this.parent._reql_conn.get_connection();
      check(conn !== undefined, `Connection to the database is down.`);
      logger.debug(`Running ${r.Error.printQuery(request.reql)}`);

      request.reql.run(conn).then((res) => this.handle_response(request, res),
                                  (err) => this.handle_response_error(request, err));
  }

  handle_response(request, res) {
    logger.debug(`Got result ${res} for ${request.raw.request_id} - ${request.raw.type}`);
    try {
      request.endpoint.handle_response(request, res, (data) => this.send_response(request, data));
    } catch (err) {
      logger.debug(`Error when handling response: ${err.message}`);
      this.send_response(request, { error: err.message });
    }
  }

  send_response(request, data) {
    // Ignore responses for disconnected clients
    if (this.socket.readyState !== websocket.OPEN) {
      logger.debug(`Attempted to send a response to a disconnected client: ${JSON.stringify(data)}.`);
    } else {
      data.request_id = request.id;
      logger.debug(`Sending response: ${JSON.stringify(data)}`);
      this.socket.send(JSON.stringify(data));
    }
  }

  run_prerequisite(request, root_term) {
      var conn = this.parent._reql_conn.get_connection();
      check(conn !== undefined, `Connection to the database is down.`);
      logger.debug(`Running ${r.Error.printQuery(root_term)}`);

      root_term.run(conn).then(() => this.run_request(request),
                               (err) => this.handle_response_error(request, err));
  }

  handle_response_error(request, info) {
    const database_exists_regex = /Database `\w+` already exists/;
    const table_exists_regex = /Table `\w+\.\w+` already exists/;
    const index_exists_regex = /Index `\w+` already exists on table `\w+\.\w+`/;
    const table_not_ready_regex = /[Pp]rimary replica for shard .* not available/;
    const index_not_ready_regex = /Index `(\w+)` on table `(\w+)\.(\w+)` was accessed before its construction was finished/;
    const database_missing_regex = /Database `(\w+)` does not exist/;
    const table_missing_regex = /Table `(\w+)\.(\w+)` does not exist/;
    const index_missing_regex = /Index `(\w+)` was not found on table `(\w+)\.(\w+)`/;

    logger.debug(`Got error ${info} for ${request.id} - ${request.raw.type}`);
    // Ignore responses for disconnected clients
    if (this.socket.readyState !== websocket.OPEN) {
      logger.debug(`Disconnected client got an error: ${JSON.stringify(info)}.`);
      return;
    }

    var matches;

    // We may have tried to create a table or index while it was already being
    // created, recognize those errors and retry.
    if (database_exists_regex.test(info.msg) ||
        table_exists_regex.test(info.msg) ||
        index_exists_regex.test(info.msg)) {
      logger.debug(`No prerequisites to run, retrying original request.`);
      return this.run_request(request);
    }

    // If the index or table is still building, wait on them
    // TODO: update this once http://github.com/rethinkdb/rethinkdb/issues/5057 is fixed
    if (table_not_ready_regex.test(info.msg) &&
        Date.now() - request.start_time < 10000) {
      logger.warn(`Waiting for unknown table to be ready.`);
      return setTimeout(() => this.run_request(request), 100);
    }

    matches = info.msg.match(index_not_ready_regex);
    if (matches !== null && matches.length === 4) {
      logger.warn(`Waiting for index "${matches[2]}.${matches[3]}:${matches[1]}" to be ready.`);
      return this.run_prerequisite(request,
        r.db(String(matches[2])).table(String(matches[3])).indexWait(String(matches[1])));
    }

    // If a db, table, or index used does not exist, we must create them
    matches = info.msg.match(database_missing_regex);
    if (matches !== null && matches.length === 2) {
      logger.warn(`Creating missing db "${matches[1]}".`);
      return this.run_prerequisite(request, r.dbCreate(String(matches[1])));
    }

    matches = info.msg.match(table_missing_regex);
    if (matches !== null && matches.length === 3) {
      logger.warn(`Creating missing table "${matches[1]}.${matches[2]}".`);
      return this.run_prerequisite(request,
        r.db(String(matches[1])).tableCreate(String(matches[2])));
    }

    matches = info.msg.match(index_missing_regex);
    if (matches !== null && matches.length === 4) {
      logger.warn(`Creating missing index "${matches[2]}.${matches[3]}:${matches[1]}".`);
      return this.run_prerequisite(request,
        r.db(String(matches[2])).table(String(matches[3])).indexCreate(String(matches[1])));
    }

    var response = { request_id: request.id,
                     error: info.msg,
                     error_code: 0 };
    logger.debug(`Sending error response: ${JSON.stringify(response)}`);
    this.socket.send(JSON.stringify(response));
  }

  reql_connection_lost() {
    // TODO: notify client, other cleanup
  }

  check_permissions() {
    return true;
  }
}

module.exports = { Client };
