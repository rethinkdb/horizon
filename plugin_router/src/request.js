'use strict';

class Request {
  constructor(request, currentMethod) {
    this.request_id = request.request_id;
    this.options = request.options;
    this.clientCtx = request.clientCtx;
    this._parameters = request.parameters;
    this._currentMethod = currentMethod;
  }

  getParameter(methodName) {
    return this._parameters[methodName];
  }

  setParameter(value) {
    assert(this._currentMethod);
    return this._parameters[this._currentMethod] = value;
  }
}

module.exports = Request;
