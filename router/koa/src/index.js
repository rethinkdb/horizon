'use strict';

const HorizonBaseRouter = require('@horizon/base-router');

function HorizonKoaRouter(...serverOptions) {
  let closed = false;
  const baseRouter = new HorizonBaseRouter(...serverOptions);

  function add(...args) {
    return baseRouter.add(...args);
  }

  function remove(...args) {
    return baseRouter.remove(...args);
  }

  function close(...args) {
    closed = true;
    return baseRouter.close(...args);
  }

  function *middleware(next) {
    if (!closed) {
      const handler = baseRouter._handlerForPath(this.path);
      if (handler) {
        handler(this.request, this.response);
        return;
      }
    }

    yield next;
  }

  // RSI: do this stuff with prototypes and stuff, not explicitly
  middleware.add = add;
  middleware.remove = remove;
  middleware.close = close;
  middleware.server = baseRouter.server;
  middleware.events = baseRouter.events;
  middleware.plugins = baseRouter.plugins;
  middleware.routes = baseRouter.routes;

  return middleware;
}

module.exports = HorizonKoaRouter;
