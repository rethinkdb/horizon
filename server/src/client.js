'use strict';

const logger = require('./logger');
const schemas = require('./schema/horizon_protocol');
const Response = require('./response').Response;

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
    this.context = { };

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
    return this.context;
  }

  handle_websocket_close() {
    logger.debug('ClientConnection closed.');
    this.responses.forEach((response) => response.close());
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
      const request_id = request.request_id === undefined ? null : request.request_id;

      if (request.request_id === undefined) {
        // This is pretty much an unrecoverable protocol error, so close the connection
        this.close({request_id, error: `Protocol error: ${err}`, error_code: 0});
      } else {
        this.send_error({request_id}, err_str);
      }
    }
  }

  handle_handshake(data) {
    const request = this.parse_request(data, schemas.handshake);
    logger.debug(`Received handshake: ${JSON.stringify(request)}`);

    if (request === undefined) {
      return this.close({error: 'Invalid handshake.', error_code: 0});
    }

    this.auth.handshake(request).then((res) => {
      this.context.user = res.payload;
      const info = {
        token: res.token,
        id: res.payload.id,
        provider: res.payload.provider,
      };
      this.send_message(request, info);
      this.socket.on('message', (msg) =>
        this.error_wrap_socket(() => this.handle_request(msg)));
      this.clientEvents.emit('auth', this.context);
    }).catch((err) => {
      this.close({request_id: request.request_id, error: `${err}`, error_code: 0});
    });
  }

  handle_request(data) {
    logger.debug(`Received request from client: ${data}`);
    const raw_request = this.parse_request(data, schemas.request);

    if (raw_request === undefined) {
      return;
    } else if (raw_request.type === 'end_subscription') {
      // there is no response for end_subscription
      return this.remove_response(raw_request.request_id);
    } else if (raw_request.type === 'keepalive') {
      return this.send_message(raw_request, {state: 'complete'});
    }

    const response = new Response((obj) => this.send_message(raw_request, obj));
    this.responses.set(raw_request.request_id, response);
    this.middlewareCb(raw_request, response);
  }


  remove_response(request_id) {
    const response = this.responses.get(request_id);
    this.responses.delete(request_id);
    if (response) {
      response.close();
    }
  }

  is_open() {
    return this.socket.readyState === websocket.OPEN;
  }

  close(info) {
    if (this.is_open()) {
      const close_msg =
        (info.error && info.error.substr(0, 64)) || 'Unspecified reason.';
      logger.debug('Closing ClientConnection with message: ' +
                   `${info.error || 'Unspecified reason.'}`);
      logger.debug(`info: ${JSON.stringify(info)}`);
      if (info.request_id !== undefined) {
        this.socket.send(JSON.stringify(info));
      }
      this.socket.close(1002, close_msg);
    }
  }

  send_message(request, data) {
    // Ignore responses for disconnected clients
    if (this.is_open()) {
      data.request_id = request.request_id;
      logger.debug(`Sending response: ${JSON.stringify(data)}`);
      this.socket.send(JSON.stringify(data));
    }
  }

  send_error(request, err, code) {
    logger.debug(
      `Sending error result for request ${request.request_id}:\n${err.stack}`);

    const error = err instanceof Error ? err.message : err;
    const error_code = code === undefined ? -1 : code;
    this.send_message(request, {error, error_code});
  }
}

module.exports = ClientConnection;
