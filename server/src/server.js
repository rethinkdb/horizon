'use strict';

const { check } = require('./error');
const { Client } = require('./client');
const { ReqlConnection } = require('./reql_connection');
const logger = require('./logger');
const fusion_protocol = require('./schema/fusion_protocol');
const server_options = require('./schema/server_options');

const endpoints = {
  insert: require('./endpoint/insert'),
  query: require('./endpoint/query'),
  remove: require('./endpoint/remove'),
  replace: require('./endpoint/replace'),
  store: require('./endpoint/store'),
  subscribe: require('./endpoint/subscribe'),
  update: require('./endpoint/update'),
  upsert: require('./endpoint/upsert'),
};

const assert = require('assert');
const Joi = require('joi');
const websocket = require('ws');
const { _extend: extend } = require('util');

const protocol_name = 'rethinkdb-fusion-v0';

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
    const opts = Joi.attempt(user_opts, server_options);
    this._endpoints = new Map();
    this._ws_servers = new Set();
    this._clients = new Set();
    this._reql_conn = new ReqlConnection(opts.rdb_host,
                                         opts.rdb_port,
                                         opts.db,
                                         opts.dev_mode,
                                         this._clients);

    for (let key of Object.keys(endpoints)) {
      this.add_endpoint(key, endpoints[key].make_reql, endpoints[key].handle_response);
    }

    const ws_options = { handleProtocols: accept_protocol,
                         verifyClient: (info, cb) => this.verify_client(info, cb) };
    if (opts.websocket_path) {
      ws_options.path = opts.websocket_path;
    }

    const add_websocket = (server) => {
      this._ws_servers.add(new websocket.Server(extend({ server }, ws_options))
        .on('error', (error) => logger.error(`Websocket server error: ${error}`))
        .on('connection', (socket) => new Client(socket, this)));
    };

    if (http_servers.forEach === undefined) {
      add_websocket(http_servers);
    } else {
      http_servers.forEach(add_websocket);
    }
  }

  verify_client(info, cb) {
    // Reject connections if we aren't synced with the database
    if (!this._reql_conn.is_ready()) {
      cb(false, 503, `Connection to the database is down.`);
    } else {
      cb(true);
    }
  }

  add_endpoint(endpoint_name, make_reql, handle_response) {
    assert(make_reql !== undefined);
    assert(handle_response !== undefined);
    assert(this._endpoints.get(endpoint_name) === undefined);
    this._endpoints.set(endpoint_name, { make_reql: make_reql, handle_response: handle_response });
  }

  ready() {
    return this._reql_conn.ready();
  }

  close() {
    this._ws_servers.forEach((s) => s.close());
    this._reql_conn.close();
  }

  _get_endpoint(request) {
    const { value, error } = Joi.validate(request, fusion_protocol.request);
    if (error !== null) { throw new Error(error.details[0].message); }

    const endpoint = this._endpoints.get(value.type);
    check(endpoint !== undefined, `"${value.type}" is not a recognized endpoint.`);
    return endpoint;
  }
}

module.exports = { Server, protocol: protocol_name, logger };
