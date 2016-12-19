'use strict';

const assert = require('assert');

const parameters = Symbol('parameters');
const currentMethod = Symbol('currentMethod');

class Request {
  constructor(request, method) {
    if (typeof method !== 'string') {
      throw new Error('Request method must be a string.');
    }

    this.requestId = request.requestId;
    this.options = request.options;
    this.clientContext = request.clientContext;
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

Request.init = function(request, clientContext) {
  Object.freeze(request.options);
  request[parameters] = {};
  request.clientContext = clientContext;
  return request;
};

module.exports = Request;
