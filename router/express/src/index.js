'use strict';

const HorizonBaseRouter = require('@horizon/base-router');

const express = require('express');

function HorizonExpressRouter(...serverOptions) {
  // Using local variables so it can later be removed without leaking things
  let baseRouter = new HorizonBaseRouter(...serverOptions);
  let expressRouter = express.Router();
  let routes = new Map(); // For recreating the router when a route is removed

  function addHandler(path, handler) {
    routes.set(path, handler);
    expressRouter.use(path, handler);
  }

  addHandler('/horizon.js', (req, res) => {
    res.head('Content-Type', 'application/javascript');
    res.send(baseRouter.server.clientSource());
    res.end();
  });

  addHandler('/horizon.js.map', (req, res) => {
    res.head('Content-Type', 'application/javascript');
    res.send(baseRouter.server.clientSourceMap());
    res.end();
  });

  addHandler('/horizon-core.js.map', (req, res) => {
    res.head('Content-Type', 'application/javascript');
    res.send(baseRouter.server.clientSourceCore());
    res.end();
  });

  addHandler('/horizon-core.js.map', (req, res) => {
    res.head('Content-Type', 'application/javascript');
    res.send(baseRouter.server.clientSourceCoreMap());
    res.end();
  });

  function add(...args) {
    return baseRouter.add(...args).then((active) => {
      if (active.http) {
        addHandler(`/${active.name}/`, active.http);
      }
      return active;
    });
  }

  function remove(name, ...args) {
    return Promise.resolve().then(() => {
      // Remove the route before deactivating the plugin
      const path = `/${name}/`;
      if (routes.has(path)) {
        routes.delete(`/${name}/`);
        expressRouter = express.Router();
        routes.forEach((handler, route) => {
          expressRouter.use(route, handler);
        });
      }

      return baseRouter.remove(...args);
    });
  }

  function close(...args) {
    routes.clear();
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

