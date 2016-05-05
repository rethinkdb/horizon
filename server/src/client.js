'use strict';

const logger = require('./logger');
const schemas = require('./schema/horizon_protocol');
const Request = require('./request').Request;

const Joi = require('joi');
const websocket = require('ws');

class Client {
  constructor(socket, server) {
    logger.debug('Client connection established.');
    this._socket = socket;
    this._server = server;
    this._auth = this._server._auth;
    this._metadata = this._server._reql_conn.metadata();
    this._requests = new Map();
    this.user_info = { };

    this._socket.on('close', (code, msg) =>
      this.handle_websocket_close(code, msg));

    this._socket.on('error', (error) =>
      this.handle_websocket_error(error));

    // The first message should always be the handshake
    this._socket.once('message', (data) =>
      this.error_wrap_socket(() => this.handle_handshake(data)));

    if (!this._metadata.is_ready()) {
      this.close('No connection to the database.');
    }

    this._metadata.connection().on('close', () =>
      this.close('Connection to the database was lost.'));
  }

  handle_websocket_close() {
    logger.debug('Client connection terminated.');
    if (this.user_feed) {
      this.user_feed.close();
    }
    this._requests.forEach((request) => {
      request.close();
    });
    this._requests.clear();
  }

  handle_websocket_error(code, msg) {
    logger.error(`Received error from client: ${msg} (${code})`);
  }

  error_wrap_socket(cb) {
    try {
      cb();
    } catch (err) {
      this.close({ request_id: -1,
                   error: `Unhandled error: ${err}`,
                   error_code: 0 });
    }
  }

  parse_request(data, schema) {
    let request;
    try {
      request = JSON.parse(data);
    } catch (err) {
      return this.close({ request_id: -1,
                          error: `Invalid JSON: ${err}`,
                          error_code: 0 });
    }

    try {
      return Joi.attempt(request, schema);
    } catch (err) {
      const detail = err.details[0];
      const err_str = `Request validation error at "${detail.path}": ${detail.message}`;
      const request_id = request.request_id === undefined ? null : request.request_id;

      if (request.request_id === undefined) {
        // This is pretty much an unrecoverable protocol error, so close the connection
        this.close({ request_id, error: `Protocol error: ${err}`, error_code: 0 });
      } else {
        this.send_error({ request_id }, err_str);
      }
    }
  }

  handle_handshake(data) {
    const request = this.parse_request(data, schemas.handshake);

    if (request === undefined) {
      return this.close({ error: 'Invalid handshake.', error_code: 0 });
    }

    const success = (user_feed, token) => {
      this.user_feed = user_feed;

      if (this.user_feed) {
        this.user_feed.eachAsync((change) => {
          this.user_data = change.new_val;
          if (change.new_val === null) {
            this.close('User account has been deleted.');
          }
        });
      } else {
        this.user_info = { id: null, groups: [ 'unauthenticated' ] };
      }
      this._socket.on('message', (msg) =>
        this.error_wrap_socket(() => this.handle_request(msg)));
      this.send_response(request, { token });
    };

    const done = (err, token, decoded) => {
      if (err) {
        this.close({ request_id: request.request_id,
                     error: `${err}`, error_code: 0 });
      } else if (decoded.user !== null) {
        this._metadata.get_user_feed(decoded.user, (rdb_err, feed) => {
          if (rdb_err) {
            this.close({ request_id: request.request_id,
                         error: 'User does not exist.', error_code: 0 });
          } else {
            success(feed, token);
          }
        });
      } else {
        success(null, token);
      }
    };

    switch (request.method) {
    case 'token':
      this._auth.verify_jwt(request.token, done);
      break;
    case 'anonymous':
      this._auth.generate_anon_jwt(done);
      break;
    case 'unauthenticated':
      this._auth.generate_unauth_jwt(done);
      break;
    default:
      this.close({ request_id: request.request_id,
                   error: `Unknown handshake method "${request.method}"`,
                   error_code: 0 });
      break;
    }
  }

  handle_request(data) {
    logger.debug(`Received request from client: ${data}`);
    const raw_request = this.parse_request(data, schemas.request);

    if (raw_request === undefined) {
      return;
    } else if (raw_request.type === 'end_subscription') {
      return this.remove_request(raw_request); // there is no response for end_subscription
    }

    const endpoint = this._server.get_request_handler(raw_request);
    if (endpoint === undefined) {
      return this.send_error(raw_request, `"${raw_request.type}" is not a registered request type.`);
    } else if (this._requests.has(raw_request.request_id)) {
      return this.send_error(raw_request, `Request ${raw_request.request_id} already exists for this client.`);
    }

    console.log(`Starting request with: ${JSON.stringify(raw_request)}`);
    const request = new Request(raw_request, endpoint, this);
    this._requests.set(raw_request.request_id, request);
    request.run();
  }

  remove_request(raw_request) {
    const request = this._requests.delete(raw_request.request_id);
    if (request) {
      request.close();
    }
  }

  is_open() {
    return this._socket.readyState === websocket.OPEN;
  }

  close(info) {
    if (this.is_open()) {
      const close_msg = (info.error && info.error.substr(0, 64)) || 'Unspecified reason.';
      logger.debug(`Closing client connection with message: ${close_msg}`);
      if (info.request_id !== undefined) {
        this._socket.send(JSON.stringify(info),
                         () => this._socket.close(1002, close_msg));
      } else {
        this._socket.close(1002, close_msg);
      }
    }
  }

  send_response(request, data) {
    // Ignore responses for disconnected clients
    if (this.is_open()) {
      data.request_id = request.request_id;
      logger.debug(`Sending response: ${JSON.stringify(data)}`);
      this._socket.send(JSON.stringify(data));
    }
  }

  send_error(request, err, code) {
    const error = err instanceof Error ? err.message : err;
    const error_code = code === undefined ? -1 : code;
    this.send_response(request, { error, error_code });
  }
}

module.exports = { Client };
