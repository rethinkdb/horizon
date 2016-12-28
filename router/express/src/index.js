'use strict';

const HorizonBaseRouter = require('@horizon/base-router');

const express = require('express');

function HorizonExpressRouter(...serverOptions) {
  const baseRouter = new HorizonBaseRouter(...serverOptions);
  let expressRouter;

  function initExpressRouter() {
    expressRouter = express.Router();
    baseRouter.routes.forEach((handler, path) => {
      expressRouter.use(path, handler);
    });
  }

  function add(...args) {
    return baseRouter.add(...args).then((active) => {
      if (active.http) {
        initExpressRouter();
      }
      return active;
    });
  }

  function remove(name, ...args) {
    return Promise.resolve().then(() => {
      const path = `/${name}/`;
      if (baseRouter.routes.has(path)) {
        baseRouter.routes.delete(path);
        initExpressRouter();
      }

      return baseRouter.remove(name, ...args);
    });
  }

  function close(...args) {
    expressRouter = null;
    return baseRouter.close(...args);
  }

  function middleware(req, res, next) {
    if (expressRouter) {
      expressRouter(req, res, next);
    } else {
      next();
    }
  }

  // RSI: do this stuff with prototypes and stuff, not explicitly
  middleware.add = add;
  middleware.remove = remove;
  middleware.close = close;
  middleware.server = baseRouter.server;
  middleware.events = baseRouter.events;
  middleware.plugins = baseRouter.plugins;
  middleware.routes = baseRouter.routes;

  initExpressRouter();
  return middleware;
}

module.exports = HorizonExpressRouter;

