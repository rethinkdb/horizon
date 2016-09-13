'use strict';

const HorizonServer = require('@horizon/server');
const PluginRouterBase = require('@horizon/plugin-router-base');

const express = require('express');

function PluginRouterExpress(hz) {
  // Using local variables so it can later be removed without leaking things
  let horizonServer = hz;
  let pluginRouter = new PluginRouterBase(horizonServer);
  let expressRouter = express.Router();
  let routes = new Map(); // For recreating the router when a route is removed

  function middleware(req, res, next) {
    if (expressRouter) {
      expressRouter(req, res, next);
    } else {
      next();
    }
  }

  function addHandler(path, handler) {
    routes.set(path, handler);
    expressRouter.use(path, handler);
  }

  function add(...args) {
    return Promise.resolve().then(() => {
      if (!pluginRouter) { throw new Error('PluginRouter has been closed.'); }
      return pluginRouter.add(...args);
    }).then((active) => {
      if (active.http) {
        addHandler(`/${active.name}/`, active.http);
      }
      return active;
    });
  }

  function remove(name, ...args) {
    return Promise.resolve().then(() => {
      if (!pluginRouter) { throw new Error('PluginRouter has been closed.'); }

      // Remove the route before deactivating the plugin
      const path = `/${name}/`;
      if (PluginRouterBase.isValidName(name) && routes.has(path)) {
        routes.delete(`/${name}/`);
        expressRouter = express.Router();
        routes.forEach((handler, route) => {
          expressRouter.use(route, handler);
        });
      }

      return pluginRouter.remove(...args);
    });
  }

  let closePromise;
  function close(...args) {
    if (!closePromise) {
      expressRouter = null;
      horizonServer = null;
      routes.clear();
      routes = null;
      closePromise = pluginRouter.close(...args);
      pluginRouter = null;
    }
    return closePromise;
  }

  addHandler('/horizon.js', (req, res) => {
    res.head('Content-Type', 'application/javascript');
    res.send(HorizonServer.clientSource());
    res.end();
  });

  addHandler('/horizon.js.map', (req, res) => {
    res.head('Content-Type', 'application/javascript');
    res.send(HorizonServer.clientSourceMap());
    res.end();
  });

  addHandler('/horizon-core.js.map', (req, res) => {
    res.head('Content-Type', 'application/javascript');
    res.send(HorizonServer.clientSourceCore());
    res.end();
  });

  addHandler('/horizon-core.js.map', (req, res) => {
    res.head('Content-Type', 'application/javascript');
    res.send(HorizonServer.clientSourceCoreMap());
    res.end();
  });

  middleware.add = add;
  middleware.remove = remove;
  middleware.close = close;
  return middleware;
}

module.exports = PluginRouterExpress;

