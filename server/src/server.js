'use strict';

const { check } = require('./error');
const fusion_client = require('./client');
const fusion_protocol = require('./schema/fusion_protocol');
const logger = require('./logger');
const { Metadata } = require('./metadata');
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

const accept_protocol = (protocols, cb) => {
  if (protocols.findIndex((x) => x === protocol_name) !== -1) {
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
  constructor(host, port, db, dev_mode, clients) {
    this.host = host;
    this.port = port;
    this.db = db;
    this.dev_mode = dev_mode;
    this.clients = clients;
    this.connection = undefined;
    this.reconnect_delay = 0;
    this._ready = false;
    this._ready_promise = new Promise((resolve) => this.init_connection(resolve));
  }

  reconnect(resolve) {
     this.connection = undefined;
     this.metadata = undefined;
     this.clients.forEach((client) => client.reql_connection_lost());
     this.clients.clear();
     setTimeout(() => this.init_connection(resolve), this.reconnect_delay);
     this.reconnect_delay = Math.min(this.reconnect_delay + 100, 1000);
  }

  init_connection(resolve) {
    logger.info(`Connecting to RethinkDB: ${this.host}:${this.port}`);
    r.connect({ host: this.host, port: this.port, db: this.db })
     .then((conn) => {
       logger.info(`Connection to RethinkDB established.`);
       conn.on('close', () => this.reconnect(resolve));
       this.connection = conn;
       this.connection.on('error', (err) => this.handle_conn_error(err));
       this.metadata = new Metadata(this.connection, this.dev_mode, (err) => {
         if (err !== undefined) {
           err = err.msg ? err.msg : err; // Shitty workaround for reql errors
           logger.error(`Failed to synchronize with database server: ${err}`);
           conn.close();
         } else {
           conn.removeAllListeners('close');
           conn.on('close', () => {
             this._ready_promise = new Promise((res) => this.reconnect(res));
           });
           this.reconnect_delay = 0;
           this._ready = true;
           resolve();
         }
       });
     },
     (err) => {
       logger.error(`Connection to RethinkDB terminated: ${err}`);
       this.reconnect(resolve);
     });
  }

  is_ready() {
    return this._ready;
  }

  ready() {
    return this._ready_promise;
  }

  get_connection() {
    check(this._ready, `Connection to the database is down.`);
    return this.connection;
  }

  get_metadata() {
    check(this._ready, `Connection to the database is down.`);
    return this.metadata;
  }
}

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
                                         opts.dev_mode,
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
                                                        handleProtocols: accept_protocol,
                                                        verifyClient: (info, cb) => this.verify_client(info, cb) })
        .on('error', (error) => logger.error(`Websocket server error: ${error}`))
        .on('connection', (socket) => new fusion_client.Client(socket, this)));
    });
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

  local_port(host) {
    return this._local_ports.get(host);
  }

  ready() {
    return this._reql_conn.ready();
  }

  close() {
    this._ws_servers.forEach((server) => server.close());
    this._http_servers.forEach((server) => server.close());
  }

  _get_endpoint(request) {
    const { value, error } = Joi.validate(request, fusion_protocol.request);
    if (error !== null) { throw new Error(error.details[0].message); }

    const endpoint = this._endpoints.get(value.type);
    check(endpoint !== undefined, `"${value.type}" is not a recognized endpoint.`);
    return endpoint;
  }
}

class UnsecureServer extends BaseServer {
  constructor(user_opts) {
    logger.warn(`Creating unsecure HTTP server.`);
    const opts = Joi.attempt(user_opts, server_options.unsecure);

    super(opts, () => {
      return new http.Server(handle_http_request);
    });
  }
}

class Server extends BaseServer {
  constructor(user_opts) {
    const opts = Joi.attempt(user_opts, server_options.secure);

    super(opts, () => {
      return new https.Server({ key: opts.key, cert: opts.cert },
                              handle_http_request);
    });
  }
}

module.exports = { UnsecureServer, Server, protocol: protocol_name, logger };
