'use strict';

const HorizonServer = require('@horizon/server');

const EventEmitter = require('events');

const illegalChars = './';
const closePromise = Symbol('closePromise');
const readyPlugins = Symbol('readyPlugins');
const pathPrefix = Symbol('pathPrefix');

function checkValidName(name) {
  for (let i = 0; i < name.length; ++i) {
    for (let j = 0; j < illegalChars.length; ++j) {
      if (name[i] === illegalChars[j]) {
        throw new Error(`Invalid plugin name "${name}": ` +
                        `cannot contain "${illegalChars[j]}"`);
      }
    }
  }
}

class HorizonBaseRouter extends EventEmitter {
  constructor(...serverOptions) {
    super();
    this.server = new HorizonServer(...serverOptions);
    this.events = this.server.events;
    this.plugins = new Map();
    this[readyPlugins] = new Set();
    this[closePromise] = null;

    // RSI: this code relies on the router being mounted at the same
    //  path as the websocket server
    // Express should be able to mount anywhere because it strips off the preceding path
    // Basic HTTP and Koa will only handle http requests under server.options.path
    // Hapi relies on being configured with a path wildcard (but only for subpaths
    //  of server.options.path)
    this[pathPrefix] = this.server.context.horizon.options.path;

    const makeHandler = (mimeType, getData) => (req, res) => {
      res.set('Content-Type', mimeType);
      res.send(getData());
      res.end();
    };

    // These are not used here, but may be utilized by subclassing routers
    this.routes = new Map([
      ['/horizon.js',
        makeHandler('application/javascript',
          () => this.server.clientSource())],
      ['/horizon.js.map',
        makeHandler('application/json',
          () => this.server.clientSourceMap())],
      ['/horizon-core.js',
        makeHandler('application/javascript',
          () => this.server.clientSourceCore())],
      ['/horizon-core.js.map',
        makeHandler('application/json',
          () => this.server.clientSourceCoreMap())],
    ]);
  }

  close() {
    if (!this[closePromise]) {
      this.routes.clear();
      this[closePromise] = Promise.all(
        Array.from(this.plugins.keys()).map((p) => this.remove(p))
      ).then(() => this.server.close());
    }
    return this[closePromise];
  }

  add(plugin, rawOptions) {
    return Promise.resolve().then(() => {
      const options = Object.assign({name: plugin.name}, rawOptions);

      if (this[closePromise]) {
        throw new Error('Horizon PluginRouter is closed.');
      } else if (this.plugins.has(options.name)) {
        throw new Error(`Plugin conflict: "${options.name}" already present.`);
      }

      checkValidName(options.name);

      // Placeholder so we don't say we're ready too soon
      this.plugins.set(options.name, null);
      this.emit('unready', this);

      this.plugins.set(options.name, Promise.resolve().then(() =>
        plugin.activate(this.server.context, options,
                        () => this._noteReady(options.name),
                        () => this._noteUnready(options.name))
      ).then((active) => {
        const addedMethods = [];
        try {
          for (const m in active.methods) {
            this.server.addMethod(m, active.methods[m]);
            addedMethods.push(m);
          }
        } catch (err) {
          // Back out and clean up safely if any methods failed to add
          addedMethods.forEach((m) => this.server.removeMethod(m));
          throw err;
        }

        if (plugin.activate.length < 3) {
          this._noteReady(options.name);
        }

        if (active.http) {
          this.routes.set(`/${active.name}/`, active.http);
        }

        // RSI: we probably need to return a few more things in 'active' (for use by
        //  sub-plugin-router implementations)
        active.name = options.name;
        active.plugin = plugin;
        active.options = options;

        return active;
      }));

      return this.plugins.get(options.name);
    });
  }

  remove(name, reason) {
    return Promise.resolve().then(() => {
      const activatePromise = this.plugins.get(name);

      if (!activatePromise) {
        throw new Error(`Plugin "${name}" is not present.`);
      }

      this.routes.delete(`/${name}/`);
      this.plugins.delete(name);
      return activatePromise.then((active) => {
        for (const m in active.methods) {
          this.server.removeMethod(m);
        }
        if (active.plugin.deactivate) {
          return active.plugin.deactivate(this.server.context, active.options,
                                          reason || 'Removed from PluginRouter.');
        }
      });
    });
  }

  _noteReady(plugin) {
    if (!this[readyPlugins].has(plugin)) {
      this[readyPlugins].add(plugin);
      this.emit('pluginReady', plugin, this);
      if (this[readyPlugins].size === this.plugins.size) {
        setImmediate(() => this.emit('ready', this));
      }
    }
  }

  _noteUnready(plugin) {
    if (this[readyPlugins].has(plugin)) {
      this[readyPlugins].delete(plugin);
      this.emit('pluginUnready', plugin, this);
      if (this[readyPlugins].size === this.plugins.size - 1) {
        this.emit('unready', this);
      }
    }
  }

  _handlerForPath(path) {
    if (path.startsWith(this[pathPrefix]) &&
        (path.length === this[pathPrefix].length ||
         path[this[pathPrefix].length] === '/')) {
      const subpathEnd = path.indexOf('/', this[pathPrefix].length + 1);
      const subpath = subpathEnd === -1 ?
        path.substring(this[pathPrefix].length) :
        path.substring(this[pathPrefix].length, subpathEnd + 1);
      return this.routes.get(subpath);
    }
  }

  // Convert basic http request and response objects into something express-compatible
  // TODO: I have little faith that this is the correct way to do things
  _makeReqRes(app, req, res, next) {
    req.res = res;
    res.req = req;
    req.next = next;
    // TODO: supposedly this kills the performance?
    Object.setPrototypeOf(req, app.request);
    Object.setPrototypeOf(res, app.response);
    return [req, res];
  }
}

module.exports = HorizonBaseRouter;

