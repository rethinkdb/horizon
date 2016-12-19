'use strict';

const Auth = require('./auth');
const ClientConnection = require('./client_connection');
const {ReliableConn} = require('./reliable');
const schema = require('./schema');
const Request = require('./request');

const fs = require('fs');
const EventEmitter = require('events');

const r = require('rethinkdb');
const Joi = require('joi');
const websocket = require('ws');
const Toposort = require('toposort-class');

const protocolName = 'rethinkdb-horizon-v1';
const clientSourcePath = require.resolve('@horizon/client/dist/horizon');
const clientSourceCorePath = require.resolve('@horizon/client/dist/horizon-core');

// Load these lazily (but synchronously)

function lazyLoadSource(sourcePath) {
  let buffer;
  return () => {
    if (!buffer) {
      buffer = fs.readFileSync(sourcePath);
    }
    return buffer;
  };
}

const clientSource = lazyLoadSource(clientSourcePath);
const clientSourceMap = lazyLoadSource(`${clientSourcePath}.map`);
const clientSourceCore = lazyLoadSource(clientSourceCorePath);
const clientSourceCoreMap = lazyLoadSource(`${clientSourceCorePath}.map`);

function makeCapabilitiesCode(capabilities) {
  return `
;{
  let capabilities = ${JSON.stringify(capabilities)};
  Object.keys(capabilities).forEach(function (key) {
    Horizon.addOption(key, capabilities[key].type);
  });
};`;
}

class Server {
  constructor(httpServers, options) {
    this.events = new EventEmitter();
    this.httpServers = httpServers[Symbol.iterator] ? Array.from(httpServers) : [httpServers];

    this._wsServers = [];
    this._closePromise = null;
    this._methods = {};
    this._middlewareMethods = new Set();
    this._clients = new Set();

    this.context = {
      horizon: {
        options: Joi.attempt(options || {}, schema.server),
        events: this.events,
        protocol: protocolName,
        r,
      },
    };

    this.context.horizon.reliableConn = new ReliableConn(this.context, {
      host: this.context.horizon.options.rdbHost,
      port: this.context.horizon.options.rdbPort,
      db: this.context.horizon.options.projectName,
      user: this.context.horizon.options.rdbUser || 'admin',
      password: this.context.horizon.options.rdbPassword || '',
      timeout: this.context.horizon.options.rdbTimeout || null,
    });

    this.context.horizon.conn = () => this.context.horizon.reliableConn.connection();
    this.context.horizon.auth = new Auth(this.context);

    // Replace the auth options with the verified options
    this.context.horizon.options.auth = this.context.horizon.auth.options;

    // Hide the rdbPassword and tokenSecret from plugins
    this.context.horizon.options.rdbPassword = null;
    this.context.horizon.options.auth.tokenSecret = null;

    // Freeze the 'official' horizon context so plugins can't fuck with it
    // TODO: might be some valid use cases for fucking with it, consider not doing this
    Object.freeze(this.context.horizon.options.auth);
    Object.freeze(this.context.horizon.options);
    Object.freeze(this.context.horizon);

    this._clearClientsSubscription = this.context.horizon.reliableConn.subscribe({
      onReady: () => {
        this.context.horizon.events.emit('ready', this);
      },
      onUnready: (err) => {
        this.context.horizon.events.emit('unready', this, err);
        const msg = (err && err.message) || 'Connection became unready.';
        this._clients.forEach((client) => client.close({error: msg}));
        this._clients.clear();
      },
    });

    this._requestHandler = (req, res, next) => {
      let terminal = null;
      const requirements = {};

      this._middlewareMethods.forEach((name) => {
        requirements[name] = true;
      });

      for (const o in req.options) {
        const m = this._methods[o];
        if (!m) {
          next(new Error(`No method to handle option "${o}".`));
          return;
        }

        if (m.type === 'terminal') {
          if (terminal !== null) {
            next(new Error('Multiple terminal methods in request: ' +
                           `"${terminal}", "${o}".`));
            return;
          }
          terminal = o;
        } else {
          requirements[o] = true;
        }
        for (const requirement of m.requires) {
          requirements[requirement] = true;
        }
      }

      if (terminal === null) {
        next(new Error('No terminal method was specified in the request.'));
      } else if (requirements[terminal]) {
        next(new Error(`Terminal method "${terminal}" is also a requirement.`));
      } else {
        const ordering = this._getRequirementsOrdering();
        const chain = Object.keys(requirements).sort(
          (a, b) => ordering[a] - ordering[b]);
        chain.push(terminal);

        chain.reduceRight((cb, methodName) =>
          (maybeErr) => {
            if (maybeErr instanceof Error) {
              next(maybeErr);
            } else {
              try {
                this._methods[methodName].handler(new Request(req, methodName), res, cb);
              } catch (e) {
                next(e);
              }
            }
          }, next)();
      }
    };

    const wsOptions = {
      handleProtocols: (protocols, cb) => {
        const res = protocols.includes(protocolName);
        cb(res, res ? protocolName : null);
        if (!res) {
          this.context.horizon.events.emit('log', 'debug',
            `Rejecting client without "${protocolName}" protocol ` +
            `(${JSON.stringify(protocols)})`);
        }
      },
      verifyClient: (info, cb) => {
        // Reject connections if we aren't synced with the database
        if (!this.context.horizon.reliableConn.ready) {
          cb(false, 503, 'Connection to the database is down.');
        } else {
          cb(true);
        }
      },
      path: this.context.horizon.options.path,
    };

    // RSI: only become ready when the websocket servers and the
    // connection are both ready.
    this.httpServers.forEach((server) => {
      const wsServer = new websocket.Server(Object.assign({server}, wsOptions))
        .on('error', (error) =>
          this.context.horizon.events.emit('log', 'error',
            `Websocket server error: ${error}`))
        .on('connection', (socket) => {
          try {
            if (!this.context.horizon.reliableConn.ready) {
              throw new Error('No connection to the database.');
            }

            const client = new ClientConnection(this.context, socket, this._requestHandler);
            this._clients.add(client);
            this.context.horizon.events.emit('connect', client.clientContext);
            socket.once('close', () => {
              this._clients.delete(client);
              this.context.horizon.events.emit('disconnect', client.clientContext);
            });
          } catch (err) {
            this.context.horizon.events.emit('log', 'error',
              `Failed to construct client: ${err}`);
            if (socket.readyState === websocket.OPEN) {
              socket.close(1002, err.message.substr(0, 64));
            }
          }
        });

      this._wsServers.push(wsServer);
    });
  }

  _invalidateCapabilities() {
    this._capabilities = null;
    this._requirementsOrder = null;
    this._applyCapabilitiesCode = null;
    this._modifiedClientSource = null;
    this._modifiedClientSourceCore = null;
  }

  addMethod(name, rawOptions) {
    const options = Joi.attempt(rawOptions, schema.method);
    if (this._methods[name]) {
      throw new Error(`"${name}" is already registered as a method.`);
    }
    this._invalidateCapabilities();
    this._methods[name] = options;
    if (options.type === 'middleware') {
      this._middlewareMethods.add(name);
    }
  }

  removeMethod(name) {
    const options = this._methods[name];
    if (options) {
      this._invalidateCapabilities();
      this._middlewareMethods.delete(name);
      delete this._methods[name];
    }
  }

  _getRequirementsOrdering() {
    if (!this._requirementsOrdering) {
      const topo = new Toposort();
      for (const m in this._methods) {
        const reqs = this._methods[m].requires;
        topo.add(m, reqs);
        for (const req of reqs) {
          if (!this._methods[req]) {
            throw new Error(
              `Missing method "${req}", which is required by method "${m}".`);
          }
        }
      }
      this._requirementsOrdering = topo.sort().reverse();
    }
    return this._requirementsOrdering;
  }

  // TODO: We close clients in `onUnready` above, but don't wait for them to be closed.
  close() {
    if (!this._closePromise) {
      this._closePromise =
        Promise.all(this._wsServers.map((s) => new Promise((resolve) => {
          s.close(resolve);
        }))).then(() => this.context.horizon.reliableConn.close());
    }
    return this._closePromise;
  }

  capabilities() {
    if (!this._capabilities) {
      this._capabilities = {};
      for (const key in this._methods) {
        this._capabilities[key] = {type: this._methods[key].type};
      }
    }
    return this._capabilities;
  }

  applyCapabilitiesCode() {
    if (!this._applyCapabilitiesCode) {
      this._applyCapabilitiesCode = makeCapabilitiesCode(this.capabilities());
    }
    return this._applyCapabilitiesCode;
  }

  clientSource() {
    if (!this._modifiedClientSource) {
      this._modifiedClientSource = clientSource() + this.applyCapabilitiesCode();
    }
    return this._modifiedClientSource;
  }

  clientSourceMap() {
    return clientSourceMap();
  }

  clientSourceCore() {
    if (!this._modifiedClientSourceCore) {
      this._modifiedClientSourceCore = clientSourceCore() + this.applyCapabilitiesCode();
    }
    return this._modifiedClientSourceCore;
  }

  clientSourceCoreMap() {
    return clientSourceCoreMap();
  }
}

module.exports = {
  Server,
};
