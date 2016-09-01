'use strict';

const logger = require('./logger');
const schemas = require('./schema/horizon_protocol');
const Response = require('./response');

const Joi = require('joi');
const websocket = require('ws');

class ClientConnection {
  constructor(socket,
              auth,
              middlewareCb,
              clientEvents) {
    logger.debug('ClientConnection established.');
    this.socket = socket;
    this.auth = auth;
    this.middlewareCb = middlewareCb;
    this.clientEvents = clientEvents;
    this._context = { };

    this.responses = new Map();

    this.socket.on('close', (code, msg) =>
      this.handle_websocket_close(code, msg));

    this.socket.on('error', (error) =>
      this.handle_websocket_error(error));

    // The first message should always be the handshake
    this.socket.once('message', (data) =>
      this.error_wrap_socket(() => this.handle_handshake(data)));
  }

  context() {
    return this._context;
  }

  handle_websocket_close() {
    logger.debug('ClientConnection closed.');
    this.responses.forEach((response) => response.end());
    this.responses.clear();
  }

  handle_websocket_error(code, msg) {
    logger.error(`Received error from client: ${msg} (${code})`);
  }

  error_wrap_socket(cb) {
    try {
      cb();
    } catch (err) {
      logger.debug(`Unhandled error in request: ${err.stack}`);
      this.close({
        request_id: null,
        error: `Unhandled error: ${err}`,
        error_code: 0,
      });
    }
  }

  parse_request(data, schema) {
    let request;
    try {
      request = JSON.parse(data);
    } catch (err) {
      return this.close({
        request_id: null,
        error: `Invalid JSON: ${err}`,
        error_code: 0,
      });
    }

    try {
      return Joi.attempt(request, schema);
    } catch (err) {
      const detail = err.details[0];
      const err_str = `Request validation error at "${detail.path}": ${detail.message}`;
      const reqId = request.request_id === undefined ? null : request.request_id;

      if (request.request_id === undefined) {
        // This is pretty much an unrecoverable protocol error, so close the connection
        this.close({reqId, error: `Protocol error: ${err_str}`, error_code: 0});
      } else {
        this.send_error(reqId, new Error(err_str));
      }
    }
  }

  handle_handshake(data) {
    const request = this.parse_request(data, schemas.handshake);
    logger.debug(`Received handshake: ${JSON.stringify(request)}`);

    if (request === undefined) {
      return this.close({error: 'Invalid handshake.', error_code: 0});
    }

    const reqId = request.request_id;
    this.auth.handshake(request).then((res) => {
      this._context.user = res.payload;
      this.send_message(reqId, {
        token: res.token,
        id: res.payload.id,
        provider: res.payload.provider,
      });
      this.socket.on('message', (msg) =>
        this.error_wrap_socket(() => this.handle_request(msg)));
      this.clientEvents.emit('auth', this._context);
    }).catch((err) => {
      logger.debug(`Error during client handshake: ${err.stack}`);
      this.close({request_id: reqId, error: `${err}`, error_code: 0});
    });
  }

  handle_request(data) {
    logger.debug(`Received request from client: ${data}`);
    const raw_request = this.parse_request(data, schemas.request);

    if (raw_request === undefined) {
      return;
    }

    const reqId = raw_request.request_id;
    if (raw_request.type === 'keepalive') {
      return this.send_message(reqId, {state: 'complete'});
    } else if (raw_request.type === 'end_subscription') {
      // there is no response for end_subscription
      return this.remove_response(reqId);
    } else if (this.responses.get(reqId)) {
      return this.close({ error: `Received duplicate request_id: ${reqId}` });
    }

    Object.freeze(raw_request.options);
    raw_request.clientCtx = this._context;
    raw_request._parameters = {};

    const response = new Response((obj) => this.send_message(reqId, obj));
    this.responses.set(reqId, response);
    response.complete.then(() => this.remove_request(reqId));

    this.middlewareCb(raw_request, response, (err) =>
      response.end(err || new Error(`Request ran past the end of the middleware stack.`)));
  }


  remove_response(request_id) {
    const response = this.responses.get(request_id);
    this.responses.delete(request_id);
    response.end();
  }

  is_open() {
    return this.socket.readyState === websocket.OPEN;
  }

  close(info) {
    if (this.is_open()) {
      const reason =
        (info.error && info.error.substr(0, 64)) || 'Unspecified reason.';
      logger.debug('Closing ClientConnection with reason: ' +
                   `${reason}`);
      logger.debug(`Final message: ${JSON.stringify(info)}`);
      if (info.request_id !== undefined) {
        this.socket.send(JSON.stringify(info));
      }
      this.socket.close(1002, reason);
    }
  }

  send_message(reqId, data) {
    // Ignore responses for disconnected clients
    if (this.is_open()) {
      data.request_id = reqId;
      logger.debug(`Sending response: ${JSON.stringify(data)}`);
      this.socket.send(JSON.stringify(data));
    }
  }

  send_error(reqId, err, code) {
    logger.debug(
      `Sending error result for request ${reqId}:\n${err.stack}`);

    const error = err instanceof Error ? err.message : err;
    const error_code = code === undefined ? -1 : code;
    this.send_message(reqId, {error, error_code});
  }
}

module.exports = ClientConnection;
