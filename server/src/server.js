'use strict';

const Auth = require('./auth').Auth;
const ClientConnection = require('./client');
const logger = require('./logger');
const {ReliableConn, ReliableChangefeed} = require('./reliable');
const schema = require('./schema/server_options');
const Request = require('./request');

const EventEmitter = require('events');

const Joi = require('joi');
const websocket = require('ws');
const r = require('rethinkdb');
const Toposort = require('toposort-class');

const protocolName = 'rethinkdb-horizon-v1';

function handleProtocols(protocols, cb) {
  if (protocols.findIndex((x) => x === protocolName) !== -1) {
    cb(true, protocolName);
  } else {
    logger.debug(`Rejecting client without "${protocolName}" protocol (${protocols}).`);
    cb(false, null);
  }
}

class Server {
  constructor(http_servers, user_opts) {
    this.options = Joi.attempt(user_opts || { }, schema.options);
    this._auth_methods = { };
    this._request_handlers = new Map();
    this._ws_servers = [];
    this._close_promise = null;
    this._methods = {};
    this._middlewareMethods = new Set();
    this._auth = new Auth(this, this.options.auth);
    this._clients = new Set();
    this.events = new EventEmitter();

    this.rdbConnection = new ReliableConn({
      host: this.options.rdb_host,
      port: this.options.rdb_port,
      db: this.options.project_name,
      user: this.options.rdb_user || 'admin',
      password: this.options.rdb_password || '',
      timeout: this.options.rdb_timeout || null,
    });

    this._clear_clients_subscription = this.rdbConnection.subscribe({
      onReady: () => {
        this.events.emit('ready', this);
      },
      onUnready: (err) => {
        this.events.emit('unready', this, err);
        const msg = (err && err.message) || 'Connection became unready.';
        this._clients.forEach((client) => client.close({error: msg}));
        this._clients.clear();
      },
    });

    const verifyClient = (info, cb) => {
      // Reject connections if we aren't synced with the database
      if (!this.rdbConnection.ready) {
        cb(false, 503, 'Connection to the database is down.');
      } else {
        cb(true);
      }
    };

    const ws_options = {handleProtocols, verifyClient, path: this.options.path};

    // RSI: only become ready when the websocket servers and the
    // connection are both ready.
    const add_websocket = (server) => {
      const ws_server = new websocket.Server(Object.assign({server}, ws_options))
        .on('error', (error) => logger.error(`Websocket server error: ${error}`))
        .on('connection', (socket) => {
          try {
            if (!this.rdbConnection.ready) {
              throw new Error('No connection to the database.');
            }

            const client = new ClientConnection(
              socket,
              this._auth,
              this._getRequestHandler,
              this._getCapabilities,
              this.events,
            );
            this._clients.add(client);
            this.events.emit('connect', client.context());
            socket.once('close', () => {
              this._clients.delete(client);
              this.events.emit('disconnect', client.context());
            });
          } catch (err) {
            logger.error(`Failed to construct client: ${err}`);
            if (socket.readyState === websocket.OPEN) {
              socket.close(1002, err.message.substr(0, 64));
            }
          }
        });

      this._ws_servers.push(ws_server);
    };

    if (http_servers.forEach === undefined) {
      add_websocket(http_servers);
    } else {
      http_servers.forEach((s) => add_websocket(s));
    }
  }

  auth() {
    return this._auth;
  }

  addMethod(name, raw_options) {
    const options = Joi.attempt(raw_options, schema.method);
    if (this._methods[name]) {
      throw new Error(`"${name}" is already registered as a method.`);
    }
    this._methods[name] = raw_options;

    if (options.type === 'middleware') {
      this._middlewareMethods.add(name); 
    }

    this._requirementsOrdering = null;
    this._capabilities = null;
  }

  removeMethod(name) {
    delete this._methods[name];
    this._middlewareMethods.delete(name);
    this._requirementsOrdering = null;
    this._capabilities = null;
  }

  _getRequirementsOrdering() {
    if (!this._requirementsOrdering) {
      this._requirementsOrdering = {};

      const topo = new Toposort();
      for (const m in this._methods) {
        const reqs = this._methods[m].requires;
        topo.add(m, reqs);
        for (const r of reqs) {
          if (!this._methods[r]) {
            throw new Error(
              `Missing method "${r}", which is required by method "${m}".`);
          }
        }
      }

      this._requirementsOrdering = topo.sort().reverse();
    }
    return this._requirementsOrdering;
  }

  _getCapabilities() {
    if (!this._capabilities) {
      this._capabilities = {options: [], terminals: []};
      for (const k in this._methods) {
        const method = this._methods[k];
        switch (method.type) {
        case 'option':
          this._capabilities.options.push(k);
          break;
        case 'terminal':
          this._capabilities.terminals.push(k);
          break;
        default:
          break;
        }
      }
    }
    return this._capabilities;
  }

  _getRequestHandler() {
    return (req, res, next) => {
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
        for (const r of m.requires) {
          requirements[r] = true;
        }
      }

      if (terminal === null) {
        next(new Error('No terminal method was specified in the request.'));
      } else if (requirements[terminal]) {
        next(new Error(`Terminal method "${terminal}" is also a requirement.`));
      } else {
        const ordering = this.requirementsOrdering();
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
  }

  // TODO: We close clients in `onUnready` above, but don't wait for them to be closed.
  close() {
    if (!this._close_promise) {
      this._close_promise =
        Promise.all(this._ws_servers.map((s) => new Promise((resolve) => {
          s.close(resolve);
        }))).then(() => this.rdbConnection.close());
    }
    return this._close_promise;
  }
}

module.exports = {
  Server,
  protocol: protocolName,
};
