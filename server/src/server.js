'use strict';

const Auth = require('./auth').Auth;
const ClientConnection = require('./client');
const logger = require('./logger');
const {ReliableConn, ReliableChangefeed} = require('./reliable');
const {ReliableMetadata} = require('./metadata/reliable_metadata');
const optionsSchema = require('./schema/server_options').server;

const EventEmitter = require('events');
const Joi = require('joi');
const websocket = require('ws');
const r = require('rethinkdb');

const protocolName = 'rethinkdb-horizon-v0';

function handleProtocols(protocols, cb) {
  if (protocols.findIndex((x) => x === protocolName) !== -1) {
    cb(true, protocolName);
  } else {
    logger.debug(`Rejecting client without "${protocolName}" protocol (${protocols}).`);
    cb(false, null);
  }
}

class Server extends EventEmitter {
  constructor(http_servers, user_opts) {
    super();
    this.options = Joi.attempt(user_opts || { }, optionsSchema);
    this._auth_methods = { };
    this._request_handlers = new Map();
    this._ws_servers = [];
    this._close_promise = null;
    this._defaultMiddlewareCb = (req, res, next) => {
      next(new Error('No middleware to handle the request.'));
    };
    this._middlewareCb = this._defaultMiddlewareCb;
    this._auth = new Auth(this, this.options.auth);

    this._reliableConn = new ReliableConn({
      host: this.options.rdb_host,
      port: this.options.rdb_port,
      db: this.options.project_name,
      user: this.options.rdb_user || 'admin',
      password: this.options.rdb_password || '',
      timeout: this.options.rdb_timeout || null,
    });
    this._clients = new Set();

    this.r = r;
    this.logger = logger;
    this.ReliableChangefeed = ReliableChangefeed; // RSI: better place to put this that on the context?  Should plugins require the server?

    // TODO: consider emitting errors sometimes.
    this._reliableMetadata = new ReliableMetadata(
      this.options.project_name,
      this._reliableConn,
      this._clients,
      this.options.auto_create_collection,
      this.options.auto_create_index);

    this._clear_clients_subscription = this._reliableMetadata.subscribe({
      onReady: () => {
        this.emit('ready', this);
      },
      onUnready: (err) => {
        this.emit('unready', this, err);
        const msg = (err && err.message) || 'Connection became unready.';
        this._clients.forEach((client) => client.close({error: msg}));
        this._clients.clear();
      },
    });

    const verifyClient = (info, cb) => {
      // Reject connections if we aren't synced with the database
      if (!this._reliableMetadata.ready) {
        cb(false, 503, 'Connection to the database is down.');
      } else {
        cb(true);
      }
    };

    const ws_options = {handleProtocols, verifyClient, path: this.options.path};

    // RSI: only become ready when this and metadata are both ready.
    const add_websocket = (server) => {
      const ws_server = new websocket.Server(Object.assign({server}, ws_options))
        .on('error', (error) => logger.error(`Websocket server error: ${error}`))
        .on('connection', (socket) => {
          try {
            if (!this._reliableMetadata.ready) {
              throw new Error('No connection to the database.');
            }

            const client = new ClientConnection(
              socket,
              this._auth,
              this._middlewareCb,
              this // Used to emit a client auth event
            );
            this._clients.add(client);
            this.emit('connect', client.context());
            socket.on('close', () => {
              this._clients.delete(client);
              this.emit('disconnect', client.context());
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

  metadata() {
    return this._reliableMetadata;
  }

  rdb_connection() {
    return this._reliableConn;
  }

  set_middleware(mw) {
    this._middlewareCb = mw ? mw : this._defaultMiddlewareCb;
  }

  // TODO: We close clients in `onUnready` above, but don't wait for
  // them to be closed.
  close() {
    if (!this._close_promise) {
      this._close_promise = this._reliableMetadata.close().then(
        () => Promise.all(this._ws_servers.map((s) => new Promise((resolve) => {
          s.close(resolve);
        })))
      ).then(
        () => this._reliableConn.close()
      );
    }
    return this._close_promise;
  }
}

module.exports = {
  Server,
  protocol: protocolName,
};
