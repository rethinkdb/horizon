'use strict';

const check = require('./error').check;
const logger = require('./logger');
const schemas = require('./schema/horizon_protocol');

const Joi = require('joi');
const r = require('rethinkdb');
const websocket = require('ws');

class Request {
  constructor(client, raw_request) {
    this.client = client;
    this.raw = raw_request;
    this.id = this.raw.request_id;
    this.start_time = Date.now();

    try {
      this.endpoint = client.parent.get_request_handler(this.raw);
      this._run_reql();
    } catch (err) {
      this._handle_error(err);
    }
  }

  add_cursor(cursor) {
    check(this.client.cursors.get(this.id) === undefined,
          'Endpoint added more than one cursor.');
    check(cursor.constructor.name === 'Cursor' ||
          cursor.constructor.name === 'Feed' ||
          cursor.constructor.name === 'AtomFeed' ||
          cursor.constructor.name === 'OrderByLimitFeed',
          'Endpoint provided a non-cursor as a cursor.');
    this.client.cursors.set(this.id, cursor);
  }

  remove_cursor() {
    this.client.cursors.delete(this.id);
  }

  _run_reql() {
    try {
      this.client.check_permissions(this.raw);

      const conn = this.client.parent._reql_conn.get_connection();
      const metadata = this.client.parent._reql_conn.get_metadata();
      check(conn !== undefined && metadata !== undefined,
            'Connection to the database is down.');

      const reql = this.endpoint.make_reql(this.raw, metadata);
      logger.debug(`Running ${r.Error.printQuery(reql)}`);
      reql.run(conn, { timeFormat: 'raw', binaryFormat: 'raw' })
          .then((res) => this._handle_response(res),
                (err) => this._handle_error(err));
    } catch (err) {
      this._handle_error(err);
    }
  }

  _handle_error(err) {
    logger.debug(`Error on request ${this.id}: ${err}`);

    // Ignore responses for disconnected clients
    if (this.client.socket.readyState !== websocket.OPEN) {
      return logger.debug(`Disconnected client got an error: ${JSON.stringify(err)}.`);
    }

    const metadata = this.client.parent._reql_conn.get_metadata();
    if (metadata === undefined) {
      this.client.send_response(this.id, { error: 'Connection to the database is down.' });
    } else {
      metadata.handle_error(err, (inner_err) => {
        if (inner_err) {
          logger.error(`Error (${inner_err}) when handling error (${err}).`);
          this.client.send_response(this.id, { error: inner_err.message });
        } else {
          setTimeout(() => this._run_reql(), 0);
        }
      });
    }
  }

  _handle_response(res) {
    logger.debug(`Got result ${res} for ${this.id} - ${this.raw.type}`);
    try {
      this.endpoint.handle_response(this, res, (data) => this.client.send_response(this.id, data));
    } catch (err) {
      // TODO: maybe pass this through the metadata error handler - are there
      // any cases where this could be useful?
      logger.debug(`Error when handling response: ${err.message}`);
      this.client.send_response(this.id, { error: err.message });
    }
  }

  // TODO: add functions for endpoint access:
  //   - handle_error(err) - use default error handling
  //     - in dev mode, this will automatically create/wait for dbs, tables, indexes
  //     - in release mode, this will just pass the error back to the client
  //     - allow users to register error handlers?
  // TODO: should we allow user-defined endpoints to run multiple reql queries?
  //   probably not
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
    logger.debug('Client connection established.');
    this.parent._clients.add(this); // TODO: this is a race condition - the client could miss a reql_connection_lost call
  }

  handle_close() {
    logger.debug('Client connection terminated.');
    this.parent._clients.delete(this);
    this.cursors.forEach((cursor) => cursor.close());
  }

  handle_websocket_error(code, msg) {
    logger.error(`Received error from client: ${msg} (${code})`);
  }

  parse_request(data, schema) {
    let request;
    try {
      request = JSON.parse(data);
    } catch (err) {
      logger.debug(`Unparseable request JSON: ${err}`);
      this.socket.close(1002, 'Invalid JSON.');
    }

    try {
      return Joi.attempt(request, schema);
    } catch (err) {
      if (request.request_id !== undefined) {
        this.send_response(request.request_id, { error: `${err}`, error_code: 0 });
      } else {
        // If we can't error this specific request, we have to close the connection
        logger.debug('Client request has no request id, closing connection.');
        this.socket.close(1002, 'Invalid request.');
      }
    }
  }

  handle_handshake(data) {
    logger.debug(`Got handshake request: ${data}`);
    this.socket.on('message', (msg) => this.handle_request(msg));
    const request = this.parse_request(data, schemas.handshake);

    if (request !== undefined) {
      const done = (err, token) => {
        if (err) {
          this.send_response(request.request_id, { error: `${err}`, error_code: 0 });
        } else {
          this.send_response(request.request_id, { token });
        }
      };

      switch (request.method) {
      case 'token':
        this.parent._auth.verify_jwt(request.token, done);
        break;
      case 'anonymous':
        this.parent._auth.generate_anon_jwt(done);
        break;
      case 'unauthenticated':
        this.parent._auth.generate_unauth_jwt(done);
        break;
      default:
        done(new Error(`Unknown handshake method '${request.method}'`));
      }
    }
  }

  handle_request(data) {
    logger.debug(`Received request from client: ${data}`);
    const request = this.parse_request(data, schemas.request);

    if (request !== undefined) {
      if (request.type === 'end_subscription') {
        return this.end_subscription(request); // there is no response for end_subscription
      }

      // Kick off the request - it will handle errors and send the response
      new Request(this, request);
    }
  }

  end_subscription(raw_request) {
    const cursor = this.cursors.get(raw_request.request_id);
    if (this.cursors.delete(raw_request.request_id)) {
      cursor.close();
    }
  }

  send_response(request_id, data) {
    // Ignore responses for disconnected clients
    if (this.socket.readyState !== websocket.OPEN) {
      logger.debug(`Attempted to send a response to a disconnected client: ${JSON.stringify(data)}.`);
    } else {
      data.request_id = request_id;
      logger.debug(`Sending response: ${JSON.stringify(data)}`);
      this.socket.send(JSON.stringify(data));
    }
  }

  reql_connection_lost() {
    // TODO: notify client, other cleanup
  }

  check_permissions() {
    // TODO: implement this, probably using Metadata
  }
}

module.exports = { Client };
