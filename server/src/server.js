'use strict';

const fusion_client = require('./client.js');
const fusion_read = require('./read.js');
const fusion_write = require('./write.js');
const logger = require('./logger.js');
const error = require('./error.js');

var check = error.check;

const r = require('rethinkdb');
const assert = require('assert');
const url = require('url');
const fs = require('fs');
const path = require('path');
const websocket = require('ws');
const http = require('http');
const https = require('https');

var protocol_name = 'rethinkdb-fusion-v0';
module.exports.protocol = protocol_name;
module.exports.logger = logger;

class BaseServer {
  constructor(opts, make_http_server_cb) {
    assert(opts.rdb_port !== 0);
    opts.local_hosts = opts.local_hosts || ['localhost'];
    opts.local_port = opts.local_port !== undefined ? opts.local_port : 8181;
    opts.rdb_host = opts.rdb_host || 'localhost';
    opts.rdb_port = opts.rdb_port || 28015;

    this._endpoints = new Map();
    this._http_servers = new Map();
    this._ws_servers = new Map();
    this._local_ports = new Map();
    this._clients = new Set();
    this._reql_conn = new ReqlConnection(opts.rdb_host, opts.rdb_port, this._clients);

    this.add_endpoint('subscribe', fusion_read.make_read_reql, fusion_read.handle_read_response);
    this.add_endpoint('query', fusion_read.make_read_reql, fusion_read.handle_read_response);
    this.add_endpoint('store_error', fusion_write.make_write_reql, fusion_write.handle_write_response);
    this.add_endpoint('store_update', fusion_write.make_write_reql, fusion_write.handle_write_response);
    this.add_endpoint('store_replace', fusion_write.make_write_reql, fusion_write.handle_write_response);
    this.add_endpoint('remove', fusion_write.make_write_reql, fusion_write.handle_write_response);

    opts.local_hosts.forEach((host) => {
        assert(this._http_servers.get(host) === undefined);
        this._http_servers.set(host, make_http_server_cb(opts));
      });

    this._http_servers.forEach((http_server, host) => {
        http_server.listen(opts.local_port, host);
        this._local_ports.set(host, new Promise((resolve, reject) => {
            http_server.on('listening', () => { resolve(http_server.address().port); });
          }));
        this._ws_servers.set(host, new websocket.Server({ server: http_server,
                                                          handleProtocols: accept_protocol })
          .on('error', (error) => logger.error(`Websocket server error: ${error}`))
          .on('connection', (socket) => new fusion_client.Client(socket, this)));
      });
  }

  add_endpoint(endpoint_name, make_reql, handle_response) {
    assert(this._endpoints.get(endpoint_name) === undefined);
    this._endpoints.set(endpoint_name, { make_reql: make_reql, handle_response: handle_response });
  };

  local_port(host) {
    return this._local_ports.get(host);
  }

  close() {
    this._ws_servers.forEach((server, host) => server.close());
    this._http_servers.forEach((server, host) => server.close());
  }

  _get_endpoint(request) {
    var type = request.type;
    var options = request.options;

    check(type !== undefined, `'type' must be specified.`);
    check(options !== undefined, `'options' must be specified.`);

    var endpoint = this._endpoints.get(type);
    check(endpoint !== undefined, `'${type}' is not a recognized endpoint.`);
    return endpoint;
  }
}

module.exports.UnsecureServer = class UnsecureServer extends BaseServer {
  constructor(user_opts) {
    super(user_opts, (opts) => {
        logger.warn('Creating unsecure HTTP server.');
        return new http.Server(handle_http_request);
      });
  }
}

module.exports.Server = class Server extends BaseServer {
  constructor(user_opts) {
    super(user_opts, (opts) => {
        return new https.Server({ key: opts.key, cert: opts.cert },
                                handle_http_request);
      });
  }
}

var accept_protocol = function (protocols, cb) {
  if (protocols.findIndex(x => x === protocol_name) != -1) {
    cb(true, protocol_name);
  } else {
    logger.debug(`Rejecting client without '${protocol_name}' protocol: ${protocols}`);
    cb(false, null);
  }
};

// Function which handles just the /fusion.js endpoint
var handle_http_request = function (req, res) {
  const req_path = url.parse(req.url).pathname;
  const file_path = path.resolve('../client/dist/build.js');
  logger.debug(`HTTP request for '${req_path}'`);

  if (req_path === '/fusion.js') {
    fs.access(file_path, fs.R_OK | fs.F_OK, (exists) => {
        if (exists) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Client library not found\n');
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
    res.end('Forbidden\n');
  }
};

class ReqlConnection {
  constructor(host, port, clients) {
    this.host = host;
    this.port = port;
    this.db = 'fusion'; // TODO: configurable DB
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
