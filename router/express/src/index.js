'use strict';

const HorizonBaseRouter = require('@horizon/base-router');

const express = require('express');

function HorizonExpressRouter(...serverOptions) {
  let baseRouter = new HorizonBaseRouter(...serverOptions);
  let expressRouter;

  function initExpressRouter() {
    expressRouter = express.Router();
    this.routes.forEach((handler, path) => expressRouter.use(path, handler));
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
      if (this.routes.has(path)) {
        this.routes.delete(path);
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

  middleware.add = add;
  middleware.remove = remove;
  middleware.close = close;
  middleware.server = baseRouter.server;
  middleware.pluginContext = baseRouter.pluginContext;

  return middleware;
}

module.exports = HorizonExpressRouter;

