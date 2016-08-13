'use strict';

const Auth = require('./auth').Auth;
const Client = require('./client').Client;
const ReqlConnection = require('./reql_connection').ReqlConnection;
const logger = require('./logger');
const options_schema = require('./schema/server_options').server;
const getType = require('mime-types').contentType;

// TODO: dynamically serve different versions of the horizon
// library. Minified, Rx included etc.
const horizon_client_path = require.resolve('@horizon/client/dist/horizon');

const assert = require('assert');
const fs = require('fs');
const Joi = require('joi');
const path = require('path');
const url = require('url');
const websocket = require('ws');

const protocol_name = 'rethinkdb-horizon-v0';

function handleProtocols(protocols, cb) {
  if (protocols.findIndex((x) => x === protocol_name) !== -1) {
    cb(true, protocol_name);
  } else {
    logger.debug(`Rejecting client without "${protocol_name}" protocol (${protocols}).`);
    cb(false, null);
  }
};

class Server extends EventEmitter {
  constructor(http_servers, user_opts) {
    const opts = Joi.attempt(user_opts || { }, options_schema);
    this._original_user_opts = user_opts;
    this._auth_methods = { };
    this._request_handlers = new Map();
    this._ws_servers = [ ];
    this._close_promise = null;
    this._middlewares = [ ];

    this._reliable_conn = new ReliableConn({
      host: opts.rbd_host,
      port: opts.rdb_pot,
      db: opts.project_name,
      user: opts.rdb_user || 'admin',
      password: opts.rdb_password || '',
      timeout: opts.rdb_timeout || null,
    });
    this._clients = new Set();

    this._reliable_metadata = new ReliableMetadata(
      opts.project_name,
      this._reliable_conn,
      this._clients,
      opts.auto_create_collection,
      opts.auto_create_index);
    this._clear_clients_subscription = this._reliable_metadata.subscribe({
      onReady: () => {
        this.emit('ready', this);
      }
      onUnready: (err) => {
        this.emit('unready', this);
        const msg = (err && err.message) || 'Connection became unready.';
        this._clients.forEach((client) => client.close({ error: msg }));
        this._clients.clear();
      }
    });

    this._auth = new Auth(this, opts.auth);
    for (const key in endpoints) {
      this.add_request_handler(key, endpoints[key].run);
    }

    const verifyClient = (info, cb) => {
      // Reject connections if we aren't synced with the database
      if (!this._reliable_metadata.isReady()) {
        cb(false, 503, 'Connection to the database is down.');
      } else {
        cb(true);
      }
    };

    const ws_options = { handleProtocols, verifyClient, path: opts.path };

    // RSI: only become ready when this and metadata are both ready.
    const add_websocket = (server) => {
      const ws_server = new websocket.Server(Object.assign({ server }, ws_options))
        .on('error', (error) => logger.error(`Websocket server error: ${error}`))
        .on('connection', (socket) => new Client(socket, this));

      this._ws_servers.push(ws_server);
    };

    if (http_servers.forEach === undefined) {
      add_websocket(http_servers);
    } else {
      http_servers.forEach((s) => add_websocket(s));
    }
  }

  metadata() {
    return this._reliable_metadata;
  }

  conn() {
    return this._reliable_conn;
  }

  add_middleware(mw) {
    this._middlewares.push(mw);
  }

  // TODO: We close clients in `onUnready` above, but don't wait for
  // them to be closed.
  close() {
    if (!this._close_promise) {
      this._close_promise = this._reliable_metadata.close().then(() => {
        return Promise.all(this._ws_servers.map((s) => new Promise((resolve) => {
          s.close(resolve);
        }))).then(() => {
          return this._reliable_conn.close();
        });
      });
    }
    return this._close_promise;
  }
}



module.exports = {
  Server,
  protocol: protocol_name,
};
