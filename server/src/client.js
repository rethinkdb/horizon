'use strict';

const logger = require('./logger');
const schemas = require('./schema/horizon_protocol');
const Response = require('./response');

const Joi = require('joi');
const websocket = require('ws');

class ClientConnection {
  constructor(socket,
              auth,
              requestHandlerCb,
              clientEvents) {
    logger.debug('ClientConnection established.');
    this.socket = socket;
    this.auth = auth;
    this.requestHandlerCb = requestHandlerCb;
    this.clientEvents = clientEvents;
    this._context = { };

    this.responses = new Map();

    this.socket.on('close', (code, msg) =>
      this.handleWebsocketClose(code, msg));

    this.socket.on('error', (error) =>
      this.handleWebsocketError(error));

    // The first message should always be the handshake
    this.socket.once('message', (data) =>
      this.errorWrapSocket(() => this.handleHandshake(data)));
  }

  context() {
    return this._context;
  }

  handleWebsocketClose() {
    logger.debug('ClientConnection closed.');
    this.responses.forEach((response) => response.end());
    this.responses.clear();
  }

  handleWebsocketError(code, msg) {
    logger.error(`Received error from client: ${msg} (${code})`);
  }

  errorWrapSocket(cb) {
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

  parseRequest(data, schema) {
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
      const errStr = `Request validation error at "${detail.path}": ${detail.message}`;
      const reqId = request.request_id === undefined ? null : request.request_id;

      if (request.request_id === undefined) {
        // This is pretty much an unrecoverable protocol error, so close the connection
        this.close({reqId, error: `Protocol error: ${errStr}`, error_code: 0});
      } else {
        this.sendError(reqId, new Error(errStr));
      }
    }
  }

  handleHandshake(data) {
    const request = this.parseRequest(data, schemas.handshake);
    logger.debug(`Received handshake: ${JSON.stringify(request)}`);

    if (request === undefined) {
      return this.close({error: 'Invalid handshake.', error_code: 0});
    }

    const reqId = request.request_id;
    this.auth.handshake(request).then((res) => {
      this._context.user = res.payload;
      this.sendMessage(reqId, {
        token: res.token,
        id: res.payload.id,
        provider: res.payload.provider,
      });
      this.socket.on('message', (msg) =>
        this.errorWrapSocket(() => this.handleRequest(msg)));
      this.clientEvents.emit('auth', this._context);
    }).catch((err) => {
      logger.debug(`Error during client handshake: ${err.stack}`);
      this.close({request_id: reqId, error: `${err}`, error_code: 0});
    });
  }

  handleRequest(data) {
    logger.debug(`Received request from client: ${data}`);
    const rawRequest = this.parseRequest(data, schemas.request);

    if (rawRequest === undefined) {
      return;
    }

    const reqId = rawRequest.request_id;
    if (rawRequest.type === 'keepalive') {
      return this.sendMessage(reqId, {state: 'complete'});
    } else if (rawRequest.type === 'end_subscription') {
      // there is no response for end_subscription
      return this.removeResponse(reqId);
    } else if (this.responses.get(reqId)) {
      return this.close({error: `Received duplicate request_id: ${reqId}`});
    }

    Object.freeze(rawRequest.options);
    rawRequest.clientCtx = this._context;
    rawRequest._parameters = {};

    const response = new Response((obj) => this.sendMessage(reqId, obj));
    this.responses.set(reqId, response);
    response.complete.then(() => this.remove_request(reqId));

    this.requestHandlerCb(rawRequest, response, (err) =>
      response.end(err || new Error('Request ran past the end of the ' +
                                    'request handler stack.')));
  }

  removeResponse(request_id) {
    const response = this.responses.get(request_id);
    this.responses.delete(request_id);
    response.end();
  }

  isOpen() {
    return this.socket.readyState === websocket.OPEN;
  }

  close(info) {
    if (this.isOpen()) {
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

  sendMessage(reqId, data) {
    // Ignore responses for disconnected clients
    if (this.isOpen()) {
      data.request_id = reqId;
      logger.debug(`Sending response: ${JSON.stringify(data)}`);
      this.socket.send(JSON.stringify(data));
    }
  }

  sendError(reqId, err, code) {
    logger.debug(
      `Sending error result for request ${reqId}:\n${err.stack}`);

    const error = err instanceof Error ? err.message : err;
    const error_code = code === undefined ? -1 : code;
    this.sendMessage(reqId, {error, error_code});
  }
}

module.exports = ClientConnection;
