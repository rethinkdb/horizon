'use strict';

const HorizonServer = require('@horizon/server');
const PluginRouterBase = require('@horizon/plugin-router-base');

module.exports = (hz) => {
  // Using local variables so we can later be removed without leaking things
  let pluginRouter = new PluginRouterBase(horizonServer);
  let expressRouter = express.Router();
  let routes = new Map(); // For recreating the router when a route is removed
  let horizonServer = hz;

  const middleware = function (req, res, next) {
    if (expressRouter) {
      expressRouter(req, res, next);     
    } else {
      next();
    }
  };

  const addHandler = function (path, handler) {
    routes.set(path, active.http);
    expressRouter.use(path, active.http);
  };

  middleware.add = function (...args) {
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

  middleware.remove = function (name, ...args) {
    return Promise.resolve().then(() => {
      if (!pluginRouter) { throw new Error('PluginRouter has been closed.'); }

      // Remove the route before deactivating the plugin
      const path = `/${name}/`;
      if (PluginRouterBase.isValidName(name) && routes.has(path)) {
        routes.delete(`/${name}/`);
        expressRouter = express.Router();
        routes.forEach((handler, path) => {
          expressRouter.use(path, handler);
        });
      }

      return pluginRouter.remove(...args);
    });
  };

  let closePromise;
  middleware.close = function (...args) {
    if (!closePromise) {
      expressRouter = null;
      horizonServer = null;
      closePromise = pluginRouter.close(...args);
      pluginRouter = null;
    }
    return closePromise;
  };

  addHandler('/horizon.js', (req, res, next) => {
    res.head('Content-Type', 'application/javascript');
    res.send(HorizonServer.clientSource());
    res.end();
  });

  addHandler('/horizon.js.map', (req, res, next) => {
    res.head('Content-Type', 'application/javascript');
    res.send(HorizonServer.clientSourceMap());
    res.end();
  });

  addHandler('/horizon-core.js.map', (req, res, next) => {
    res.head('Content-Type', 'application/javascript');
    res.send(HorizonServer.clientSourceCore());
    res.end();
  });

  addHandler('/horizon-core.js.map', (req, res, next) => {
    res.head('Content-Type', 'application/javascript');
    res.send(HorizonServer.clientSourceCoreMap());
    res.end();
  });

  return middleware;
};

