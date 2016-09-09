'use strict';

const EventEmitter = require('events');

class PluginRouter extends EventEmitter {
  constructor(horizon) {
    super();
    this.horizon = horizon;
    this.plugins = new Map();
    this.readyPlugins = new Set();
    this.context = {
      horizon: {
        options: horizon.options,
        auth: horizon.auth(),
        rdbConnection: horizon.rdbConnection,
        events: horizon.events,
      },
    };
  }

  close() {
    console.log(`closing plugin-router: ${JSON.stringify(this.plugins.keys())}`);
    return Promise.all(Array.from(this.plugins.keys()).map((p) => this.remove(p)));
  }

  add(plugin, options) {
    if (!options.name) {
      options.name = plugin.name;
    } 

    if (this.plugins.has(options.name)) {
      return Promise.reject(
        new Error(`Plugin conflict: "${options.name}" already present.`));
    }

    // Placeholder so we don't say we're ready too soon
    this.plugins.set(options.name, null);
    this.emit('unready', this);

    const activatePromise = Promise.resolve().then(() =>
      plugin.activate(this.context, options,
                      () => this._noteReady(options.name),
                      () => this._noteUnready(options.name))
    ).then((active) => {
      const addedMethods = [];
      try {
        for (const m in active.methods) {
          this.horizon.addMethod(m, active.methods[m]);
          addedMethods.push(m);
        }
      } catch (err) {
        // Back out and clean up safely if any methods failed to add
        addedMethods.forEach((m) => this.horizon.removeMethod(m));
        throw err;
      }
      return active;
    });

    if (plugin.activate.length < 3) {
      activatePromise.then(() => this._noteReady(options.name));
    }

    this.plugins.set(options.name, {options, activatePromise});
    return activatePromise;
  }

  remove(name, reason) {
    const plugin = this.plugins.get(name);

    if (!plugin) {
      return Promise.reject(new Error(`Plugin "${name}" is not present.`));
    }

    this.plugins.delete(name);
    console.log(`deactivating plugin ${name}`);
    return plugin.activatePromise.then((active) => {
      for (const m in active.methods) {
        this.horizon.removeMethod(m);
      }
      if (plugin.deactivate) {
        return plugin.deactivate(this.context, plugin.options,
                                 reason || 'Removed from PluginRouter.').then(() =>
          console.log(`plugin ${name} deactivated, removing methods`));
      }
      console.log(`plugin ${name} has no deactivate, done`);
    });
  }

  _noteReady(plugin) {
    if (!this.readyPlugins.has(plugin)) {
      this.readyPlugins.add(plugin);
      this.emit('pluginReady', plugin, this);
      if (this.readyPlugins.size === this.plugins.size) {
        setImmediate(() => this.emit('ready', this));
      }
    }
  }

  _noteUnready(plugin) {
    if (this.readyPlugins.has(plugin)) {
      this.readyPlugins.delete(plugin);
      this.emit('pluginUnready', plugin, this);
      if (this.readyPlugins.size === this.plugins.size - 1) {
        this.emit('unready', this);
      }
    }
  }
}

module.exports = PluginRouter;

