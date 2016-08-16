'use strict';

const examplePluginActivateResult = {
  name: 'graphql',
  deactivate: () => { },

  httpRoute: (req, res, next) => { },
  commands: {
    'repair': ...,
  }
  methods: {
    'insert': ...,
    'delete': ...,
  },
}

class PluginRouter {
  constructor(server) {
    this.server = server
    this.plugins = {}
    this.httpRoutes = {}
    this.methods = {}
  }

  add(plugin) {
    if (this.plugins[plugin.name]) {
      return Promise.reject(
        new Error(`Plugin conflict: '${plugin.name}' already present.`));
    }
    const activePlugin = Promise.resolve(server.ctx()).then(plugin.activate)
    this.plugins[plugin.name] = activePlugin.then((active) => {
      if (this.httpRoutes[plugin.name]) {
        throw new Error(`Plugin conflict: '${plugin.name}' already present.`);
      }
      // RSI: validate method name is a legal identifier and doesn't
      // conflict with our methods.
      for (const m in active.methods) {
        if (this.methods[m]) {
          throw new Error(`Method name conflict: '${m}');
        }
      }

      this.httpRoutes[plugin.name] = active;
      for (const m in active.methods) {
        this.methods[m] = active.methods[m];
      }
    });
    return this.plugins[plugin.name];
  }

  remove(plugin, reason) {
    if (!this.plugins[plugin.name]) {
      return Promise.reject(new Error(`Plugin '${plugin.name}' is not present.`));
    }
    return this.plugins[plugin.name].then(() => {
      if (plugin.deactivate) {
        plugin.deactivate(reason || "Removed from PluginRouter.");
      }
    }
  }

  httpMiddleware() {
    return (req, res, next) => {
      const pathParts = req.path.split('/');
      const name = pathParts[0] || pathParts[1];
      const plugin = this.httpRoutes[name];
      if (plugin && plugin.httpRoute) {
        plugin.httpRouter(req, res, next);
      } else {
        next();
      }
    }
  }

  hzMiddleware() {
    return (req, res, next) => {
      const method = (req.type && this.methods[req.type]) || next;
      let cb = method;
      if (req.options) {
        for (const o in req.options) {
          if (o !== req.type) {
            const m = this.methods[o];
            if (m) {
              const old_cb = cb;
              cb = (maybeErr) => {
                if (maybeErr instanceof Error) {
                  next(maybeErr);
                } else {
                  try {
                    m(req, res, old_cb);
                  } catch (e) {
                    next(e);
                  }
                }
              }
            }
          }
        }
      }
      cb();
    }
  }
}

function createPluginRouter() {
  return new PluginRouter();
}

module.exports = createPluginRouter();
module.exports.PluginRouter = PluginRouter;

