'use strict';

const Auth = require('./auth').Auth;
const ClientConnection = require('./client');
const logger = require('./logger');
const {ReliableConn, ReliableChangefeed} = require('./reliable');
const {ReliableMetadata} = require('./metadata/reliable_metadata');
const options_schema = require('./schema/server_options').server;

const EventEmitter = require('events');
const Joi = require('joi');
const websocket = require('ws');
const r = require('rethinkdb');

const protocol_name = 'rethinkdb-horizon-v0';

function handleProtocols(protocols, cb) {
  if (protocols.findIndex((x) => x === protocol_name) !== -1) {
    cb(true, protocol_name);
  } else {
    logger.debug(`Rejecting client without "${protocol_name}" protocol (${protocols}).`);
    cb(false, null);
  }
}

class Server extends EventEmitter {
  constructor(http_servers, user_opts) {
    super();
    const opts = Joi.attempt(user_opts || { }, options_schema);
    this._original_user_opts = user_opts;
    this._auth_methods = { };
    this._request_handlers = new Map();
    this._ws_servers = [];
    this._close_promise = null;
    this._defaultMiddlewareCb = (req, res, next) => {
      next(new Error('No middleware to handle the request.'));
    };
    this._middlewareCb = this._defaultMiddlewareCb;
    this._auth = new Auth(this, opts.auth);

    this._reliableConn = new ReliableConn({
      host: opts.rdb_host,
      port: opts.rdb_port,
      db: opts.project_name,
      user: opts.rdb_user || 'admin',
      password: opts.rdb_password || '',
      timeout: opts.rdb_timeout || null,
    });
    this._clients = new Set();
    this._clientEvents = new EventEmitter();

    // server context passed to plugins when activated
    this._pluginContext = {
      r,
      opts,
      logger,
      ReliableChangefeed,
      auth: this._auth,
      clientEvents: this._clientEvents,
      reliableConn: this._reliableConn,
    };

    // TODO: consider emitting errors sometimes.
    this._reliableMetadata = new ReliableMetadata(
      opts.project_name,
      this._reliableConn,
      this._clients,
      opts.auto_create_collection,
      opts.auto_create_index);

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

    const ws_options = {handleProtocols, verifyClient, path: opts.path};

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
              socket, this._auth, this._middlewareCb, this._clientEvents
            );
            this._clients.add(client);
            this._clientEvents.emit('connect', client.context());
            socket.on('close', () => {
              this._clients.delete(client);
              this._clientEvents.emit('disconnect', client.context());
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

  context() {
    return this._pluginContext;
  }

  metadata() {
    return this._reliableMetadata;
  }

  conn() {
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
  protocol: protocol_name,
};
