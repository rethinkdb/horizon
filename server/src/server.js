'use strict';

const { check } = require('./error');
const fusion_client = require('./client');
const fusion_protocol = require('./schema/fusion_protocol');
const logger = require('./logger');
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
const http = require('http');
const https = require('https');
const Joi = require('joi');
const path = require('path');
const r = require('rethinkdb');
const url = require('url');
const websocket = require('ws');

const protocol_name = 'rethinkdb-fusion-v0';

class BaseServer {
  constructor(opts, make_http_server) {
    this._endpoints = new Map();
    this._http_servers = new Map();
    this._ws_servers = new Map();
    this._local_ports = new Map();
    this._clients = new Set();
    this._reql_conn = new ReqlConnection(opts.rdb_host,
                                         opts.rdb_port,
                                         opts.db,
                                         this._clients);

    for (let key of Object.keys(endpoints)) {
      this.add_endpoint(key, endpoints[key].make_reql, endpoints[key].handle_response);
    }

    opts.local_hosts.forEach((host) => {
        assert(this._http_servers.get(host) === undefined);
        this._http_servers.set(host, make_http_server());
      });

    this._http_servers.forEach((http_server, host) => {
        http_server.listen(opts.local_port, host);
        this._local_ports.set(host, new Promise((resolve) => {
            http_server.on('listening', () => { resolve(http_server.address().port); });
          }));
        this._ws_servers.set(host, new websocket.Server({ server: http_server,
                                                          handleProtocols: accept_protocol })
          .on('error', (error) => logger.error(`Websocket server error: ${error}`))
          .on('connection', (socket) => new fusion_client.Client(socket, this)));
      });
  }

  add_endpoint(endpoint_name, make_reql, handle_response) {
    assert(make_reql !== undefined);
    assert(handle_response !== undefined);
    assert(this._endpoints.get(endpoint_name) === undefined);
    this._endpoints.set(endpoint_name, { make_reql: make_reql, handle_response: handle_response });
  }

  local_port(host) {
    return this._local_ports.get(host);
  }

  close() {
    this._ws_servers.forEach((server) => server.close());
    this._http_servers.forEach((server) => server.close());
  }

  _get_endpoint(request) {
    const { value, error } = Joi.validate(request, fusion_protocol.request);
    if (error !== null) { throw new Error(error.details[0].message); }

    var endpoint = this._endpoints.get(value.type);
    check(endpoint !== undefined, `"${value.type}" is not a recognized endpoint.`);
    return endpoint;
  }
}

class UnsecureServer extends BaseServer {
  constructor(user_opts) {
    var opts = Joi.attempt(user_opts, server_options.unsecure);

    super(opts, () => {
        logger.warn(`Creating unsecure HTTP server.`);
        return new http.Server(handle_http_request);
      });
  }
}

class Server extends BaseServer {
  constructor(user_opts) {
    var opts = Joi.attempt(user_opts, server_options.secure);

    super(opts, () => {
        return new https.Server({ key: opts.key, cert: opts.cert },
                                handle_http_request);
      });
  }
}

const accept_protocol = (protocols, cb) => {
  if (protocols.findIndex(x => x === protocol_name) != -1) {
    cb(true, protocol_name);
  } else {
    logger.debug(`Rejecting client without "${protocol_name}" protocol (${protocols}).`);
    cb(false, null);
  }
};

// Function which handles just the /fusion.js endpoint
const handle_http_request = (req, res) => {
  const req_path = url.parse(req.url).pathname;
  const file_path = path.resolve('../client/dist/build.js');
  logger.debug(`HTTP request for "${req_path}"`);

  if (req_path === '/fusion.js') {
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
  } else {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end(`Forbidden\n`);
  }
};

class ReqlConnection {
  constructor(host, port, db, clients) {
    this.host = host;
    this.port = port;
    this.db = db;
    this.clients = clients;
    this.connection = null;
    this.reconnect_delay = 0;
    this.reconnect();
  }

  reconnect() {
    logger.info(`Connecting to RethinkDB: ${this.host}:${this.port}`);
    r.connect({ host: this.host, port: this.port, db: this.db })
     .then((conn) => this.handle_conn_success(conn),
           (err) => this.handle_conn_error(err));
  }

  handle_conn_success(conn) {
    logger.info(`Connection to RethinkDB established.`);
    this.connection = conn;
    this.reconnect_delay = 0;
    this.connection.on('error', (err) => this.handle_conn_error(err));
  }

  handle_conn_error(err) {
    logger.error(`Connection to RethinkDB terminated: ${err}`);
    if (!this.connection) {
      this.connection = null;
      this.clients.forEach((client) => client.reql_connection_lost());
      setTimeout(() => this.reconnect(), this.reconnect_delay);
      this.reconnect_delay = Math.min(this.reconnect_delay + 100, 1000);
    }
  }

  get_connection() {
    return this.connection;
  }
}

module.exports = { UnsecureServer, Server, protocol: protocol_name, logger };
