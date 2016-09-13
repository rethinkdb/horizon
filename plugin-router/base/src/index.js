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
    return Promise.all(Array.from(this.plugins.keys()).map((p) => this.remove(p)));
  }

  add(plugin, options) {
    if (!options.name) {
      // RSI: make sure plugin names don't contain a '/'
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

      if (plugin.activate.length < 3) {
        this._noteReady(options.name);
      }

      // RSI: we probably need to return a few more things in 'active' (for use by
      //  sub-plugin-router implementations)
      active.name = options.name;
      active.plugin = plugin;
      active.options = options;

      return active;
    });

    this.plugins.set(options.name, activatePromise);
    return activatePromise;
  }

  remove(name, reason) {
    const activatePromise = this.plugins.get(name);

    if (!activatePromise) {
      return Promise.reject(new Error(`Plugin "${name}" is not present.`));
    }

    this.plugins.delete(name);
    return activatePromise.then((active) => {
      for (const m in active.methods) {
        this.horizon.removeMethod(m);
      }
      if (active.plugin.deactivate) {
        return active.plugin.deactivate(this.context, active.options,
                                        reason || 'Removed from PluginRouter.');
      }
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

