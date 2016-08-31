'use strict';

const Request = require('./request');

const Toposort = require('toposort-class');

class PluginRouter {
  constructor(server) {
    this.server = server;
    this.plugins = {};
    this.httpRoutes = {};
    this.methods = {};
  }

  add(plugin) {
    if (this.plugins[plugin.name]) {
      return Promise.reject(
        new Error(`Plugin conflict: "${plugin.name}" already present.`));
    }
    const activePlugin = Promise.resolve(this.server).then(plugin.activate);
    this.plugins[plugin.name] = activePlugin.then((active) => {
      if (this.httpRoutes[plugin.name]) {
        throw new Error(`Plugin conflict: "${plugin.name}" already present.`);
      }

      for (const m in active.methods) {
        console.log(`adding plugin method: ${m}`);
        if (this.methods[m]) {
          throw new Error(`Method name conflict: "${m}"`);
        }
      }

      this.httpRoutes[plugin.name] = active;
      for (const m in active.methods) {
        this.methods[m] = active.methods[m];
        this._requirementsOrdering = null;
      }
    }).catch((err) => {
      this.server.logger.error(`Error when adding plugin ${plugin.name}: ${err}`);
      this.server.logger.debug(`${err.stack}`);
      throw err;
    });
    return this.plugins[plugin.name];
  }

  remove(plugin, reason) {
    if (!this.plugins[plugin.name]) {
      return Promise.reject(new Error(`Plugin "${plugin.name}" is not present.`));
    }
    return this.plugins[plugin.name].then((active) => {
      for (const m in active.methods) {
        delete this.methods[m];
        this._requirementsOrdering = null;
      }
      if (plugin.deactivate) {
        plugin.deactivate(reason || 'Removed from PluginRouter.');
      }
    });
  }

  requirementsOrdering() {
    // RSI: move dependencies and topological sorting into the server
    if (!this._requirementsOrdering) {
      this._requirementsOrdering = {};

      const topo = new Toposort();
      for (const m in this.methods) {
        const reqs = this.methods[m].requires;
        if (reqs) {
          topo.add(m, reqs);
          for (const r of reqs) {
            if (!this.methods[r]) {
              throw new Error(
                `Missing method "${r}", which is required by method "${m}".`);
            }
          }
        }
      }

      this._requirementsOrdering = topo.sort().reverse();
    }
    return this._requirementsOrdering;
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
    };
  }

  hzMiddleware() {
    return (req, res, next) => {
      let terminalName = null;
      const requirements = {};
      if (req.options) {
        for (const o in req.options) {
          const m = this.methods[o];
          if (m) {
            console.log(`method for request: ${o}, type: ${m.type}`);
            if (m.type === 'terminal') {
              if (terminalName !== null) {
                next(new Error('multiple terminals in request: ' +
                               `${terminalName}, ${o}`));
              } else {
                terminalName = o;
              }
            } else {
              requirements[o] = true;
            }
            if (m.requires) {
              for (const r of m.requires) {
                requirements[r] = true;
              }
            }
          } else {
            console.log(`no ${o} method for request`);
          }
        }
      }

      if (terminalName === null) {
        next(new Error('no terminal in request'));
      } else if (requirements[terminalName]) {
        next(new Error('terminal ${terminalName} is also a requirement'));
      } else {
        const ordering = this.requirementsOrdering();
        const middlewareChain = Object.keys(requirements).sort(
          (a, b) => ordering[a] - ordering[b]);
        middlewareChain.push(terminalName);

        middlewareChain.reduceRight((cb, methodName) =>
          (maybeErr) => {
            if (maybeErr instanceof Error) {
              next(maybeErr);
            } else {
              try {
                this.methods[methodName].handler(new Request(req, methodName), res, cb);
              } catch (e) {
                next(e);
              }
            }
          }, next)();
      }
    };
  }
}

module.exports = PluginRouter;

