'use strict';

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
    const activePlugin = Promise.resolve(this.server.ctx()).then(plugin.activate);
    this.plugins[plugin.name] = activePlugin.then((active) => {
      if (this.httpRoutes[plugin.name]) {
        throw new Error(`Plugin conflict: "${plugin.name}" already present.`);
      }
      // RSI: validate method name is a legal identifier and doesn't
      // conflict with our methods.
      for (const m in active.methods) {
        if (this.methods[m]) {
          throw new Error(`Method name conflict: "${m}"`);
        }
      }

      this.httpRoutes[plugin.name] = active;
      for (const m in active.methods) {
        this.methods[m] = active.methods[m];
        this._requiresOrdering = null;
      }
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
        this._requiresOrdering = null;
      }
      if (plugin.deactivate) {
        plugin.deactivate(reason || 'Removed from PluginRouter.');
      }
    });
  }

  requiresOrdering() {
    if (!this._requiresOrdering) {
      this._requiresOrdering = {};

      // RSI: use tsort instead of doing this ourselves like mega chumps.
      const graph = {};
      for (const m in this.methods) {
        if (!graph[m]) {
          graph[m] = {name: m, inDegree: 0, children: {}};
        }
        for (const r in this.methods[m].requires) {
          graph[m].inDegree += 1;
          if (!graph[r]) {
            // RSI: assert that `r` is in `this.methods`.
            graph[r] = {name: m, inDegree: 0, children: {}};
          }
          graph[r].children[m] = true;
        }
      }

      const order = [];
      const heap = new Heap((a, b) => a.inDegree - b.inDegree);
      for (const g in graph) {
        heap.push(graph[g]);
      }
      while (heap.size() > 0) {
        const minItem = heap.pop();
        if (minItem.inDegree !== 0) {
          // ERROR: cycle (!!!)
        }
        for (const c in minItem.children) {
          if (graph[c].inDegree <= 0) {
            // ERROR: algorithm mistake
          }
          graph[c].inDegree -= 1;
          heap.updateItem(graph[c]);
        }
        order.push(minItem.name);
      }

      for (const i in order) {
        this._requiresOrdering[order[i]] = i;
      }
    }
    return this._requiresOrdering;
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
            for (const r of m.requires) {
              requirements[r] = true;
            }
          }
        }
      }

      if (terminalName === null) {
        next(new Error('no terminal in request'));
      } else if (requirements[terminalName]) {
        next(new Error('terminal ${terminalName} is also a requirement'));
      } else {
        const ordering = this.requiresOrdering();
        const middlewareChain = Object.keys(requirements).sort(
          (a, b) => ordering[a] - ordering[b]);
        middlewareChain.push(terminalName);

        middlewareChain.reduceRight((cb, methodName) =>
          (maybeErr) => {
            if (maybeErr instanceof Error) {
              next(maybeErr);
            } else {
              try {
                this.methods[methodName].impl(req, res, cb);
              } catch (e) {
                next(e);
              }
            }
          }, next)();
      }
    };
  }
}

function createPluginRouter() {
  return new PluginRouter();
}

module.exports = createPluginRouter();
module.exports.PluginRouter = PluginRouter;

