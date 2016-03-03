'use strict';

const Auth = require('./auth').Auth;
const check = require('./error').check;
const Client = require('./client').Client;
const ReqlConnection = require('./reql_connection').ReqlConnection;
const logger = require('./logger');
const horizon_protocol = require('./schema/horizon_protocol');
const options_schema = require('./schema/server_options').server;

// TODO: dynamically serve different versions of the horizon
// library. Minified, Rx included etc.
const horizon_client_path = require.resolve('@horizon/client/dist/horizon');

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
const url = require('url');
const websocket = require('ws');
const extend = require('util')._extend;

const protocol_name = 'rethinkdb-horizon-v0';

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
    const opts = Joi.attempt(user_opts || { }, options_schema);
    this._name = opts.db;
    this._request_handlers = new Map();
    this._http_handlers = new Map();
    this._ws_servers = new Set();
    this._clients = new Set();
    this._reql_conn = new ReqlConnection(opts.rdb_host,
                                         opts.rdb_port,
                                         opts.db,
                                         opts.auto_create_table,
                                         opts.auto_create_index,
                                         this._clients);
    this._auth = new Auth(this, opts.auth);
    for (let key of Object.keys(endpoints)) {
      this.add_request_handler(key, endpoints[key].make_reql, endpoints[key].handle_response);
    }

    const verify_client = (info, cb) => {
      // Reject connections if we aren't synced with the database
      if (!this._reql_conn.is_ready()) {
        cb(false, 503, `Connection to the database is down.`);
      } else {
        cb(true);
      }
    };

    const ws_options = { handleProtocols: accept_protocol, path: opts.path,
                         verifyClient: verify_client };

    const add_websocket = (server) => {
      this._ws_servers.add(new websocket.Server(extend({ server }, ws_options))
        .on('error', (error) => logger.error(`Websocket server error: ${error}`))
        .on('connection', (socket) => new Client(socket, this)));
    };

    const path_replace = new RegExp('^' + opts.path + '/');
    const add_http_listener = (server) => {
      // TODO: this doesn't play well with a user removing listeners (or maybe even `once`)
      const extant_listeners = server.listeners('request').slice(0);
      server.removeAllListeners('request');
      server.on('request', (req, res) => {
        const req_path = url.parse(req.url).pathname;
        if (req_path.indexOf(opts.path + '/') === 0) {
          const sub_path = req_path.replace(path_replace, '');
          const handler = this._http_handlers.get(sub_path);
          if (handler !== undefined) {
            logger.debug(`Handling HTTP request to horizon subpath: ${sub_path}`);
            return handler(req, res);
          }
        }
        if (extant_listeners.length === 0) {
          res.statusCode = 404;
          res.write('File not found.');
          res.end();
        } else {
          extant_listeners.forEach((l) => l.call(server, req, res));
        }
      });
    };

    this.add_http_handler('horizon.js', (req, res) => {
      serve_file(horizon_client_path, res);
    });

    this.add_http_handler('horizon.js.map', (req, res) => {
      serve_file(horizon_client_path + '.map', res);
    });

    if (http_servers.forEach === undefined) {
      add_websocket(http_servers);
      add_http_listener(http_servers);
    } else {
      http_servers.forEach((s) => { add_websocket(s); add_http_listener(s); });
    }
  }

  add_request_handler(request_name, make_reql, handle_response) {
    assert(make_reql !== undefined);
    assert(handle_response !== undefined);
    assert(this._request_handlers.get(request_name) === undefined);
    this._request_handlers.set(request_name, { make_reql: make_reql, handle_response: handle_response });
  }

  get_request_handler(request) {
    const parsed = Joi.validate(request, horizon_protocol.request);
    if (parsed.error !== null) { throw new Error(parsed.error.details[0].message); }

    const handler = this._request_handlers.get(parsed.value.type);
    check(handler !== undefined, `"${parsed.value.type}" is not a registered request type.`);
    return handler;
  }

  remove_request_handler(request_name) {
    return this._request_handlers.delete(request_name);
  }

  add_http_handler(sub_path, handler) {
    assert.notStrictEqual(handler, undefined);
    assert.strictEqual(this._http_handlers.get(sub_path), undefined);
    this._http_handlers.set(sub_path, handler);
  }

  remove_http_handler(sub_path) {
    return this._http_handlers.delete(sub_path);
  }

  add_auth_provider(provider, options) {
    provider(this, options)
  }

  ready() {
    return this._reql_conn.ready();
  }

  close() {
    this._ws_servers.forEach((s) => s.close());
    this._reql_conn.close();
  }
}

module.exports = {
  Server,
  protocol: protocol_name,
};
