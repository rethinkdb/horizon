'use strict';

const HorizonServer = require('@horizon/server');

const EventEmitter = require('events');

const illegalChars = './';

function checkValidName(name) {
  for (let i = 0; i < name.length; ++i) {
    for (let j = 0; j < illegalChars.length; ++j) {
      if (name[i] === illegalChars[j]) {
        throw new Error(`Invalid plugin name "${name}": cannot contain "${illegalChars[j]}"`);
      }
    }
  }
}

class HorizonBaseRouter extends EventEmitter {
  constructor(...serverOptions) {
    super();
    this.server = new HorizonServer(...serverOptions);
    this.pluginContext = {
      horizon: {
        options: this.server.options,
        auth: this.server.auth(),
        rdbConnection: this.server.rdbConnection,
        events: this.server.events,
      },
    };
    this._plugins = new Map();
    this._readyPlugins = new Set();
    this._closePromise = null;
  }

  close() {
    if (!this._closePromise) {
      this._closePromise = Promise.all(
        Array.from(this._plugins.keys()).map((p) => this.remove(p)));
    }
    return this._closePromise;
  }

  add(plugin, raw_options) {
    return Promise.resolve().then(() => {
      const options = Object.assign({name: plugin.name}, raw_options);

      if (this._closePromise) {
        throw new Error(`Horizon PluginRouter is closed.`);
      } else if (this._plugins.has(options.name)) {
        throw new Error(`Plugin conflict: "${options.name}" already present.`);
      }

      checkValidName(options.name);

      // Placeholder so we don't say we're ready too soon
      this._plugins.set(options.name, null);
      this.emit('unready', this);

      this._plugins.set(options.name, Promise.resolve().then(() =>
        plugin.activate(this.pluginContext, options,
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
      }));

      return this._plugins.get(options.name);
    });
  }

  remove(name, reason) {
    return Promise.resolve().then(() => {
      const activatePromise = this._plugins.get(name);

      if (this._closePromise) {
        throw new Error(`Horizon PluginRouter is closed.`);
      } else if (!activatePromise) {
        throw new Error(`Plugin "${name}" is not present.`);
      }

      this._plugins.delete(name);
      return activatePromise.then((active) => {
        for (const m in active.methods) {
          this.horizon.removeMethod(m);
        }
        if (active.plugin.deactivate) {
          return active.plugin.deactivate(this.pluginContext, active.options,
                                          reason || 'Removed from PluginRouter.');
        }
      });
    });
  }

  _noteReady(plugin) {
    if (!this._readyPlugins.has(plugin)) {
      this._readyPlugins.add(plugin);
      this.emit('pluginReady', plugin, this);
      if (this._readyPlugins.size === this._plugins.size) {
        setImmediate(() => this.emit('ready', this));
      }
    }
  }

  _noteUnready(plugin) {
    if (this._readyPlugins.has(plugin)) {
      this._readyPlugins.delete(plugin);
      this.emit('pluginUnready', plugin, this);
      if (this._readyPlugins.size === this._plugins.size - 1) {
        this.emit('unready', this);
      }
    }
  }
}

module.exports = HorizonBaseRouter;

