'use strict';

const HorizonBaseRouter = require('@horizon/base-router');
const express = require('express');

function HorizonKoaRouter(...serverOptions) {
  let closed = false;
  const baseRouter = new HorizonBaseRouter(...serverOptions);

  // Make a dummy express app for the request/response objects
  const app = express();

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
      const [req, res] =
        baseRouter._makeReqRes(app, this.request.req, this.response.res, next);
      if (handler) {
        handler(req, res, next);
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
