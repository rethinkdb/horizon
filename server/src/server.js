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
const fs = require('fs');
const Joi = require('joi');
const path = require('path');
const url = require('url');
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

const serve_file = (file_path, res) => {
  fs.access(file_path, fs.R_OK | fs.F_OK, (exists) => {
    if (exists) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end(`Client library not found\n`);
    } else {
      fs.readFile(file_path, 'binary', (err, file) => {
        if (err) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end(`${err}\n`);
        } else {
          res.writeHead(200);
          res.end(file, 'binary');
        }
      });
    }
  });
};

class Server {
  constructor(http_servers, user_opts) {
    const opts = Joi.attempt(user_opts || { }, server_options);
    this._endpoints = new Map();
    this._ws_servers = new Set();
    this._clients = new Set();
    this._reql_conn = new ReqlConnection(opts.rdb_host,
                                         opts.rdb_port,
                                         opts.db,
                                         opts.auto_create_table,
                                         opts.auto_create_index,
                                         this._clients);

    for (let key of Object.keys(endpoints)) {
      this.add_endpoint(key, endpoints[key].make_reql, endpoints[key].handle_response);
    }

    const ws_options = { handleProtocols: accept_protocol, path: opts.path,
                         verifyClient: (info, cb) => this.verify_client(info, cb) };

    const add_websocket = (server) => {
      this._ws_servers.add(new websocket.Server(extend({ server }, ws_options))
        .on('error', (error) => logger.error(`Websocket server error: ${error}`))
        .on('connection', (socket) => new Client(socket, this)));
    };

    const add_client_js = (server) => {
      const extant_listeners = server.listeners('request').slice(0);
      server.removeAllListeners('request');
      server.on('request', (req, res) => {
        const req_path = url.parse(req.url).pathname;
        if (req_path.indexOf(opts.path + '/fusion.js') === 0) {
          serve_file(path.resolve('../client/dist/fusion.js'), res);
        } else if (req_path.indexOf(opts.path + '/fusion.js.map') === 0) {
          serve_file(path.resolve('../client/dist/fusion.js.map'), res);
        } else {
          extant_listeners.forEach((l) => l.call(server, req, res));
        }
      });
    };

    if (http_servers.forEach === undefined) {
      add_websocket(http_servers);
      add_client_js(http_servers);
    } else {
      http_servers.forEach((s) => { add_websocket(s); add_client_js(s); });
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
