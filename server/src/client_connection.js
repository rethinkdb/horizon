'use strict';

const schema = require('./schema');
const Response = require('./response');
const Request = require('./request');

const Joi = require('joi');
const websocket = require('ws');

class ClientConnection {
  constructor(serverContext,
              socket,
              requestHandlerCb) {
    this.serverContext = serverContext;
    this.events = serverContext.horizon.events;
    this.socket = socket;
    this.requestHandlerCb = requestHandlerCb;
    this.clientContext = {};
    this.responses = new Map();

    this.events.emit('log', 'debug', 'ClientConnection established.');

    this.socket.on('close', (code, msg) =>
      this.handleWebsocketClose(code, msg));

    this.socket.on('error', (error) =>
      this.handleWebsocketError(error));

    // The first message should always be the handshake
    this.socket.once('message', (data) =>
      this.errorWrapSocket(() => this.handleHandshake(data)));
  }

  handleWebsocketClose() {
    this.events.emit('log', 'debug', 'ClientConnection closed.');
    this.responses.forEach((response) => response.end());
    this.responses.clear();
  }

  handleWebsocketError(code, msg) {
    this.events.emit('log', 'error', `Received error from client: ${msg} (${code})`);
  }

  errorWrapSocket(cb) {
    try {
      cb();
    } catch (err) {
      this.events.emit('log', 'debug', `Unhandled error in request: ${err.stack}`);
      this.close({
        requestId: null,
        error: `Unhandled error: ${err}`,
        errorCode: 0,
      });
    }
  }

  parseRequest(data, messageSchema) {
    let request;
    try {
      request = JSON.parse(data);
    } catch (err) {
      return this.close({
        requestId: null,
        error: `Invalid JSON: ${err}`,
        errorCode: 0,
      });
    }

    try {
      return Joi.attempt(request, messageSchema);
    } catch (err) {
      const detail = err.details[0];
      const errStr = `Request validation error at "${detail.path}": ${detail.message}`;
      const requestId = request.requestId === undefined ? null : request.requestId;

      if (request.requestId === undefined) {
        // This is pretty much an unrecoverable protocol error, so close the connection
        this.close({requestId, error: `Protocol error: ${errStr}`, errorCode: 0});
      } else {
        this.sendError(requestId, new Error(errStr));
      }
    }
  }

  handleHandshake(data) {
    const request = this.parseRequest(data, schema.handshake);
    this.events.emit('log', 'debug', `Received handshake: ${JSON.stringify(request)}`);

    if (request === undefined) {
      return this.close({error: 'Invalid handshake.', errorCode: 0});
    }

    const requestId = request.requestId;
    this.serverContext.horizon.auth.handshake(request).then((res) => {
      this.clientContext.user = res.payload;
      this.sendMessage(requestId, {
        complete: true,
        token: res.token,
        id: res.payload.id,
        provider: res.payload.provider,
      });
      this.socket.on('message', (msg) =>
        this.errorWrapSocket(() => this.handleRequest(msg)));
      this.events.emit('auth', this.clientContext);
    }).catch((err) => {
      this.events.emit('log', 'debug', `Error during client handshake: ${err.stack}`);
      this.close({requestId, error: `${err}`, errorCode: 0, complete: true});
    });
  }

  handleRequest(data) {
    this.events.emit('log', 'debug', `Received request from client: ${data}`);
    const rawRequest = this.parseRequest(data, schema.request);
    if (rawRequest === undefined) { return; }

    const requestId = rawRequest.requestId;
    if (rawRequest.type === 'keepalive') {
      return this.sendMessage(requestId, {complete: true});
    } else if (rawRequest.type === 'endRequest') {
      // there is no response for endRequest
      return this.removeResponse(requestId);
    } else if (this.responses.get(requestId)) {
      return this.close({error: `Received duplicate requestId: ${requestId}`});
    }

    const request = Request.init(rawRequest, this.clientContext);
    const response = new Response(this.events, (obj) => this.sendMessage(requestId, obj));

    this.responses.set(requestId, response);
    response.complete.then(() =>
      this.removeResponse(requestId)
    ).catch(() =>
      this.removeResponse(requestId)
    );

    this.requestHandlerCb(request, response, (err) =>
      response.end(err || new Error('Request ran past the end of the ' +
                                    'request handler stack.')));
  }

  removeResponse(requestId) {
    const response = this.responses.get(requestId);
    this.responses.delete(requestId);
    if (response) {
      response.end();
    }
  }

  isOpen() {
    return this.socket.readyState === websocket.OPEN;
  }

  close(info) {
    if (this.isOpen()) {
      const reason =
        (info.error && info.error.substr(0, 64)) || 'Unspecified reason.';
      this.events.emit('log', 'debug', `Closing ClientConnection with reason: ${reason}`);
      this.events.emit('log', 'debug', `Final message: ${JSON.stringify(info)}`);
      if (info.requestId !== undefined) {
        this.socket.send(JSON.stringify(info));
      }
      this.socket.close(1002, reason);
    }
  }

  sendMessage(requestId, data) {
    // Ignore responses for disconnected clients
    if (this.isOpen()) {
      data.requestId = requestId;
      this.events.emit('log', 'debug', `Sending response: ${JSON.stringify(data)}`);
      this.socket.send(JSON.stringify(data));
    }
  }

  sendError(requestId, err, code) {
    this.events.emit('log', 'debug',
      `Sending error result for request ${requestId}:\n${err.stack}`);

    const error = err instanceof Error ? err.message : err;
    const errorCode = code === undefined ? -1 : code;
    this.sendMessage(requestId, {error, errorCode});
  }
}

module.exports = ClientConnection;
