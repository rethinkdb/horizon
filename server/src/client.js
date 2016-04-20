'use strict';

const check = require('./error').check;
const logger = require('./logger');
const schemas = require('./schema/horizon_protocol');

const Joi = require('joi');
const r = require('rethinkdb');
const websocket = require('ws');

class Client {
  constructor(socket, parent_server) {
    this.socket = socket;
    this.parent = parent_server;
    this.cursors = new Map();

    this.socket.on('open', () => this.handle_open());
    this.socket.on('close', (code, msg) => this.handle_close(code, msg));
    this.socket.on('error', (error) => this.handle_websocket_error(error));
    this.socket.once('message', (data) =>
      this.error_wrap_socket(() => this.handle_handshake(data)));
  }

  handle_open() {
    logger.debug('Client connection established.');
    this.parent._clients.add(this); // TODO: this is a race condition - the client could miss a reql_connection_lost call
  }

  handle_close() {
    logger.debug('Client connection terminated.');
    this.parent._clients.delete(this);
    this.cursors.forEach((cursor) => cursor.close());
  }

  handle_websocket_error(code, msg) {
    logger.error(`Received error from client: ${msg} (${code})`);
  }

  close_socket(msg, err_info) {
    if (this.socket.readyState === websocket.OPEN) {
      if (err_info) {
        logger.error(`Horizon client request resulted in error: ${err_info}`);
      }
      this.socket.close(1002, `${msg}`);
    }
  }

  error_wrap_socket(cb) {
    try {
      cb();
    } catch (err) {
      this.close_socket('Unknown error.', err);
    }
  }

  parse_request(data, schema) {
    let request;
    try {
      request = JSON.parse(data);
    } catch (err) {
      return this.close_socket('Invalid JSON.', err);
    }

    try {
      return Joi.attempt(request, schema);
    } catch (err) {
      const req_id = request.request_id === undefined ? null : request.request_id;

      const detail = err.details[0];
      const err_str = `Request validation error at "${detail.path}": ${detail.message}`;
      this.send_response(req_id, { error: err_str, error_code: 0 });

      if (request.request_id === undefined) {
        // This is pretty much an unrecoverable protocol error, so close the connection
        return this.close_socket('Protocol error.', err);
      }
    }
  }

  handle_handshake(data) {
    const request = this.parse_request(data, schemas.handshake);

    if (request === undefined) {
      return this.close_socket('Invalid handshake.');
    }

    const success = (user_info, token) => {
      this.user_info = user_info;
      this.socket.on('message', (data) =>
        this.error_wrap_socket(() => this.handle_request(data)));
      this.send_response(request.request_id, { token });
    };

    const done = (err, token, decoded) => {
      if (err) {
        this.send_response(request.request_id, { error: `${err}`, error_code: 0 });
        this.close_socket('Invalid token.', err);
      } else if (decoded.user !== null) {
        const metadata = this.parent._reql_conn.metadata();
        metadata.get_user_info(decoded.user, (rdb_err, res) => {
          if (rdb_err) {
            this.send_response(request.request_id, { error: 'User does not exist.', error_code: 0 });
            this.socket.close(1002, `Invalid user.`);
          } else {
            // TODO: listen on feed
            success(res, token);
          }
        });
      } else {
        success(null, token);
      }
    };

    switch (request.method) {
    case 'token':
      this.parent._auth.verify_jwt(request.token, done);
      break;
    case 'anonymous':
      this.parent._auth.generate_anon_jwt(done);
      break;
    case 'unauthenticated':
      this.parent._auth.generate_unauth_jwt(done);
      break;
    default:
      this.close_socket('Unknown method.', `Unknown handshake method "${request.method}"`);
      break;
    }
  }

  handle_request(data) {
    logger.debug(`Received request from client: ${data}`);
    const request = this.parse_request(data, schemas.request);

    if (request !== undefined) {
      if (request.type === 'end_subscription') {
        return this.end_subscription(request); // there is no response for end_subscription
      }

      const endpoint = this.parent.get_request_handler(request);
      let handle_error;

      const run_query = () => {
        const conn = this.parent._reql_conn.connection();
        const metadata = this.parent._reql_conn.metadata();
        check(conn !== undefined && metadata !== undefined,
              'Connection to the database is down.');

        const rules = this.get_matching_rules(this.raw, metadata);

        endpoint.run(request, this.user_info, rules, metadata, (err, response) => {
          if (err) {
            handle_error(err);
          } else {
            this.send_response(request.request_id, data);
          }
        });

      }

      handle_error = (err) => {
        logger.debug(`Error on request ${request.request_id}: ${err}`);

        // Ignore responses for disconnected clients
        if (this.client.socket.readyState !== websocket.OPEN) {
          return logger.debug(`Disconnected client got an error: ${JSON.stringify(err)}.`);
        }

        const metadata = this.client.parent._reql_conn.metadata();
        if (metadata === undefined) {
          this.client.send_response(this.id, { error: 'Connection to the database is down.' });
        } else {
          metadata.handle_error(err, (inner_err) => {
            if (inner_err) {
              this.client.send_response(this.id, { error: inner_err.message });
            } else {
              setImmediate(run_query);
            }
          });
        }
      }

      try {
        run_query();
      } catch (err) {
        handle_error(err);
      }
    }
  }

  end_subscription(raw_request) {
    const cursor = this.cursors.get(raw_request.request_id);
    if (this.cursors.delete(raw_request.request_id)) {
      cursor.close();
    }
  }

  send_response(request_id, data) {
    // Ignore responses for disconnected clients
    if (this.socket.readyState !== websocket.OPEN) {
      logger.debug(`Attempted to send a response to a disconnected client: ${JSON.stringify(data)}.`);
    } else {
      data.request_id = request_id;
      logger.debug(`Sending response: ${JSON.stringify(data)}`);
      this.socket.send(JSON.stringify(data));
    }
  }

  reql_connection_lost() {
    // TODO: notify client, other cleanup
  }

  get_matching_rules(raw_query, metadata) {
    const matching_rules = [ ];
    for (const group_name of this.user_info.groups) {
      const group = this.metadata.get_group(group_name);
      if (group !== undefined) {
        for (const rule of group.rules) {
          if (rule.is_match(this.user_info, raw_query)) {
            matching_rules.push(rule);
          }
        }
      }
    }
    return matching_rules;
  }
}

module.exports = { Client };
