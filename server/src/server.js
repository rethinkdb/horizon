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

const accept_protocol = (protocols, cb) => {
  if (protocols.findIndex((x) => x === protocol_name) !== -1) {
    cb(true, protocol_name);
  } else {
    logger.debug(`Rejecting client without "${protocol_name}" protocol (${protocols}).`);
    cb(false, null);
  }
};

class Server {
  constructor(http_servers, user_opts) {
    const opts = Joi.attempt(user_opts || { }, options_schema);
    this._path = opts.path;
    this._name = opts.project_name;
    this._permissions_enabled = opts.permissions;
    this._auth_methods = { };
    this._request_handlers = new Map();
    this._ws_servers = [ ];
    this._close_promise = null;
    this._interruptor = new Promise((resolve, reject) => {
      this._interrupt = reject;
    });
    this._middlewares = [ ];

    try {
      this._reql_conn = new ReqlConnection(opts.rdb_host,
                                           opts.rdb_port,
                                           opts.project_name,
                                           opts.auto_create_collection,
                                           opts.auto_create_index,
                                           opts.rdb_user || null,
                                           opts.rdb_password || null,
                                           opts.rdb_timeout || null,
                                           this._interruptor);
      this._auth = new Auth(this, opts.auth);
      for (const key in endpoints) {
        this.add_request_handler(key, endpoints[key].run);
      }

      const verify_client = (info, cb) => {
        // Reject connections if we aren't synced with the database
        if (!this._reql_conn.is_ready()) {
          cb(false, 503, 'Connection to the database is down.');
        } else {
          cb(true);
        }
      };

      const ws_options = { handleProtocols: accept_protocol,
                           allowRequest: verify_client,
                           path: this._path };

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
    } catch (err) {
      this._interrupt(err);
      throw err;
    }
  }

  add_middleware(mw) {
    this._middlewares.push(mw);
  }

  

  ready() {
    return this._reql_conn.ready().then(() => this);
  }

  close() {
    if (!this._close_promise) {
      this._interrupt(new Error('Horizon server is shutting down.'));
      this._close_promise = Promise.all([
        Promise.all(this._ws_servers.map((s) => new Promise((resolve) => {
          s.close(resolve);
        }))),
        this._reql_conn.ready().catch(() => { }),
      ]);
    }
    return this._close_promise;
  }
}

module.exports = {
  Server,
  protocol: protocol_name,
};
