'use strict';

const assert = require('assert');

const parameters = Symbol('parameters');
const currentMethod = Symbol('currentMethod');

class Request {
  constructor(request, method) {
    this.requestId = request.requestId;
    this.options = request.options;
    this.clientCtx = request.clientCtx;
    this[parameters] = request[parameters];
    this[currentMethod] = method;
    Object.freeze(this);
  }

  getParameter(methodName) {
    return this[parameters][methodName];
  }

  setParameter(value) {
    assert(this[currentMethod]);
    this[parameters][this[currentMethod]] = value;
  }
}

Request.init = function (request, clientCtx) {
  Object.freeze(request.options);
  request[parameters] = {};
  request.clientCtx = clientCtx;
  return request;
};

module.exports = Request;
