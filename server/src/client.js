'use strict';

const logger = require('./logger');
const schemas = require('./schema/horizon_protocol');
const Request = require('./request').Request;

const Joi = require('joi');
const websocket = require('ws');

class Client {
  constructor(socket, server, metadata) {
    logger.debug('Client connection established.');
    this._socket = socket;
    this._server = server;
    this._auth = this._server._auth;
    this._permissions_enabled = this._server._permissions_enabled;
    this._metadata = metadata;
    this._requests = new Map();
    this.user_info = { };

    this._socket.on('close', (code, msg) =>
      this.handle_websocket_close(code, msg));

    this._socket.on('error', (error) =>
      this.handle_websocket_error(error));

    // The first message should always be the handshake
    this._socket.once('message', (data) =>
      this.error_wrap_socket(() => this.handle_handshake(data)));
  }

  handle_websocket_close() {
    logger.debug('Client connection terminated.');
    if (this.user_feed) {
      this.user_feed.close().catch(() => { });
    }
    this._requests.forEach((request) => {
      request.close();
    });
    this._requests.clear();
    this._server._reql_conn._clients.delete(this);
  }

  handle_websocket_error(code, msg) {
    logger.error(`Received error from client: ${msg} (${code})`);
  }

  error_wrap_socket(cb) {
    try {
      cb();
    } catch (err) {
      logger.debug(`Unhandled error in request: ${err.stack}`);
      this.close({ request_id: null,
                   error: `Unhandled error: ${err}`,
                   error_code: 0 });
    }
  }

  parse_request(data, schema) {
    let request;
    try {
      request = JSON.parse(data);
    } catch (err) {
      return this.close({ request_id: null,
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

  group_changed(group_name) {
    if (this.user_info.groups.indexOf(group_name) !== -1) {
      this._requests.forEach((req) => req.evaluate_rules());
    }
  }

  handle_handshake(data) {
    const request = this.parse_request(data, schemas.handshake);
    logger.debug(`Received handshake: ${JSON.stringify(request)}`);

    if (request === undefined) {
      return this.close({ error: 'Invalid handshake.', error_code: 0 });
    }

    let responded = false;
    this._auth.handshake(request).then((res) => {
      const finish_handshake = () => {
        if (!responded) {
          responded = true;
          const info = { token: res.token, id: res.payload.id, provider: res.payload.provider };
          this.send_response(request, info);
          this._socket.on('message', (msg) =>
            this.error_wrap_socket(() => this.handle_request(msg)));
        }
      };
      this.user_info = res.payload;

      if (this.user_info.id != null) {
        return this._metadata.get_user_feed(this.user_info.id).then((feed) => {
          this.user_feed = feed;
          return feed.eachAsync((change) => {
            if (!change.new_val) {
              throw new Error('User account has been deleted.');
            }
            Object.assign(this.user_info, change.new_val);
            this._requests.forEach((req) => req.evaluate_rules());
            finish_handshake();
          }).then(() => {
            throw new Error('User account feed has been lost.');
          });
        });
      } else {
        this.user_info.groups = [ 'default' ];
        finish_handshake();
      }
    }).catch((err) => {
      if (!responded) {
        responded = true;
        this.close({ request_id: request.request_id, error: `${err}`, error_code: 0 });
      }
    });
  }

  handle_request(data) {
    logger.debug(`Received request from client: ${data}`);
    const raw_request = this.parse_request(data, schemas.request);

    if (raw_request === undefined) {
      return;
    } else if (raw_request.type === 'end_subscription') {
      return this.remove_request(raw_request); // there is no response for end_subscription
    } else if (raw_request.type === 'keepalive') {
      return this.send_response(raw_request, { state: 'complete' });
    }

    const endpoint = this._server.get_request_handler(raw_request);
    if (endpoint === undefined) {
      return this.send_error(raw_request,
        `"${raw_request.type}" is not a registered request type.`);
    } else if (this._requests.has(raw_request.request_id)) {
      return this.send_error(raw_request,
        `Request ${raw_request.request_id} already exists for this client.`);
    }

    const request = new Request(raw_request, endpoint, this);
    this._requests.set(raw_request.request_id, request);
    request.run();
  }

  remove_request(raw_request) {
    const request = this._requests.get(raw_request.request_id);
    this._requests.delete(raw_request.request_id);
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
      logger.debug('Closing client connection with message: ' +
                   `${info.error || 'Unspecified reason.'}`);
      logger.debug(`info: ${JSON.stringify(info)}`);
      if (info.request_id !== undefined) {
        this._socket.send(JSON.stringify(info));
      }
      this._socket.close(1002, close_msg);
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
    logger.debug(`Sending error result for request ${request.request_id}:\n${err.stack}`);

    const error = err instanceof Error ? err.message : err;
    const error_code = code === undefined ? -1 : code;
    this.send_response(request, { error, error_code });
  }
}

const make_client = (socket, server) => {
  try {
    const metadata = server._reql_conn.metadata();
    const client = new Client(socket, server, metadata);
    server._reql_conn._clients.add(client);
  } catch (err) {
    logger.debug(`Rejecting client connection because of error: ${err.message}`);
    socket.close(1002, err.message.substr(0, 64));
  }
};

module.exports = { make_client };
