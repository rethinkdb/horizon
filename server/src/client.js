'use strict';

const check = require('./error').check;
const logger = require('./logger');
const schemas = require('./schema/horizon_protocol');

const Joi = require('joi');
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

  error_wrap_socket(cb) {
    try {
      cb();
    } catch (err) {
      this.close({ request_id: -1,
                   error: `Unhandled error: ${err}`,
                   error_code: 0 });
    }
  }

  parse_request(data, schema) {
    let request;
    try {
      request = JSON.parse(data);
    } catch (err) {
      return this.close({ request_id: -1,
                          error: `Invalid JSON: ${err}`,
                          error_code: 0 });
    }

    try {
      return Joi.attempt(request, schema);
    } catch (err) {
      const detail = err.details[0];
      const err_str = `Request validation error at "${detail.path}": ${detail.message}`;
      const request_id = request.request_id === undefined ? null : request.request_id;

      if (request.request_id === undefined) {
        // This is pretty much an unrecoverable protocol error, so close the connection
        this.close({ request_id, error: `Protocol error: ${err}`, error_code: 0 });
      } else {
        this.send_response(request_id, { error: err_str, error_code: 0 });
      }
    }
  }

  handle_handshake(data) {
    const request = this.parse_request(data, schemas.handshake);

    if (request === undefined) {
      return this.close({ error: 'Invalid handshake.', error_code: 0 });
    }

    const success = (user_feed, token) => {
      this.user_feed = user_feed;
      if (this.user_feed) {
        this.user_feed.eachAsync((change) => {
          this.user_data = change.new_val;
          if (change.new_val === null) {
            this.close('User account has been deleted.');
          }
        });
      } else {
        check(request.method === 'unauthenticated');
        this.user_info = { id: null, groups: [ 'unauthenticated' ] };
      }
      this.socket.on('message', (msg) =>
        this.error_wrap_socket(() => this.handle_request(msg)));
      this.send_response(request.request_id, { token });
    };

    const done = (err, token, decoded) => {
      if (err) {
        this.close({ request_id: request.request_id,
                     error: `${err}`, error_code: 0 });
      } else if (decoded.user !== null) {
        const metadata = this.parent._reql_conn.metadata();
        metadata.get_user_feed(decoded.user, (rdb_err, feed) => {
          if (rdb_err) {
            this.close({ request_id: request.request_id,
                         error: 'User does not exist.', error_code: 0 });
          } else {
            success(feed, token);
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
      this.close({ request_id: request.request_id,
                   error: `Unknown handshake method "${request.method}"`,
                   error_code: 0 });
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

        const rules = this.get_matching_rules(request, metadata);

        if (rules.length === 0) {
          handle_error(new Error('Operation not permitted.'));
        } else {
          endpoint.run(request, this.user_info, rules, metadata, (result) => {
            if (result instanceof Error) {
              handle_error(result);
            } else {
              this.send_response(request.request_id, result);
            }
          });
        }
      };

      handle_error = (err) => {
        logger.debug(`Error on request ${request.request_id}: ${err}`);
        logger.debug(`Stack: ${err.stack}`);

        // Ignore responses for disconnected clients
        if (this.socket.readyState !== websocket.OPEN) {
          return logger.debug(`Disconnected client got an error: ${JSON.stringify(err)}.`);
        }

        const metadata = this.parent._reql_conn.metadata();
        if (metadata === undefined) {
          this.send_response(request.request_id, { error: 'Connection to the database is down.' });
        } else {
          metadata.handle_error(err, (inner_err) => {
            if (inner_err) {
              this.send_response(request.request_id, { error: inner_err.message });
            } else {
              setImmediate(run_query);
            }
          });
        }
      };

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

  close(info) {
    if (this.socket.readyState === websocket.OPEN) {
      const close_msg = (info.error && info.error.substr(0, 64)) || 'Unspecified reason.';
      logger.debug(`Closing client connection with message: ${close_msg}`);
      if (info.request_id !== undefined) {
        this.socket.send(JSON.stringify(info),
                         () => this.socket.close(1002, close_msg));
      } else {
        this.socket.close(1002, close_msg);
      }
    }
    if (this.user_feed) {
      this.user_feed.close();
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
    logger.debug(`User info: ${JSON.stringify(this.user_info)}`);
    const matching_rules = [ ];
    for (const group_name of this.user_info.groups) {
      const group = metadata.get_group(group_name);
      if (group !== undefined) {
        for (const rule of group.rules) {
          if (rule.is_match(raw_query, this.user_info)) {
            matching_rules.push(rule);
          }
        }
      }
    }
    logger.debug(`Matching rules: ${JSON.stringify(matching_rules)}`);
    return matching_rules;
  }
}

module.exports = { Client };
