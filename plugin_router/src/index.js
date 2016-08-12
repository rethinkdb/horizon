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
  constructor() {
    this.plugins = {}
    this.methods = {}
  }

  addPlugin(plugin) {
    if (this.plugins[plugin.name]) {
      throw new Error(`Plugin conflict: '${plugin.name}' already present.`);
    }
    for (const m in plugin.methods) {
      if (this.methods[m]) {
        throw new Error(`Method name conflict: '${m}');
      }
    }

    this.plugins[plugin.name] = plugin;
    for (const m in plugin.methods) {
      this.methods[m] = plugin.methods[m];
    }
  }

  removePlugin(plugin) {
    if (!this.plugins[plugin.name]) {
      throw new Error(`Plugin '${plugin.name}' is not present.`);
    }
    delete this.plugins[plugin.name];
  }

  httpMiddleware() {
    return (req, res, next) => {
      const pathParts = req.path.split('/');
      const name = pathParts[0] || pathParts[1];
      const plugin = this.plugins[name];
      if (plugin && plugin.httpRoute) {
        plugin.httpRouter(req, res, next);
      } else {
        next();
      }
    }
  }

  hzMiddleware() {
    return (req, res, next) {
      const method = req.type && this.methods[req.type];
      if (method) {
        method(req, res, next);
      } else {
        next();
      }
    }
  }
}

function createPluginRouter() {
  return new PluginRouter();
}

module.exports = createPluginRouter();
module.exports.PluginRouter = PluginRouter;

