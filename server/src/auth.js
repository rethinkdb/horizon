'use strict';

const logger = require('./logger');
const options_schema = require('./schema/server_options').auth;

const assert = require('assert');
const crypto = require('crypto');
const Joi = require('joi');
const Promise = require('bluebird');
const jwt = Promise.promisifyAll(require('jsonwebtoken'));
const r = require('rethinkdb');
const url = require('url');

// Can't use objects in primary keys, so convert those to JSON in the db (deterministically)
const user_key = (provider, user_id) => {
  return r.expr(user_id).do(id => [
    provider,
    id.typeOf().eq('OBJECT').branch(id.toJSON(), id)
  ]);
};

const user_defaults = (provider, user_id) => {
  return user_key(provider, user_id).do(id => {
    return { id, provider: id(0), user_id: id(1) }
  });
};

class Auth {
  constructor(server, user_options) {
    const options = Joi.attempt(user_options, options_schema);

    this._jwt = new JWT(options);

    this._success_redirect = url.parse(options.success_redirect);
    this._failure_redirect = url.parse(options.failure_redirect);
    this._create_new_users = options.create_new_users;
    this._new_user_group = options.new_user_group;
    this._allow_anonymous = options.allow_anonymous;
    this._allow_unauthenticated = options.allow_unauthenticated;

    this._parent = server;
  }

  handshake(request) {
    switch (request.method) {
      case 'token':
        return this._jwt.verify(request.token);
      case 'unauthenticated':
        if (!this._allow_unauthenticated) {
          throw new Error('Unauthenticated connections are not allowed.');
        }
        return this._jwt.verify(this._jwt.sign({ provider: request.method }).token);
      case 'anonymous':
        if (!this._allow_anonymous) {
          throw new Error('Anonymous connections are not allowed.');
        }
        return this.generate(request.method, r.uuid());
      default:
        throw new Error(`Unknown handshake method "${request.method}"`);
    }
  }

  // TODO: maybe we should write something into the user data to track open sessions/tokens
  generate(provider, user_id) {
    const users_table = r.db('horizon_internal').table('users');

    const defaults = user_defaults(provider, user_id)
      .merge({ groups: [ this._new_user_group ] });

    let query = users_table.get(defaults('id'))
                          .default(r.error('User not found and new user creation is disabled.'));

    if (this._create_new_users) {
      query = users_table.insert(defaults, { conflict: 'error', returnChanges: 'always' })
                        .bracket('changes')(0)('new_val');
    }

    return this.reql_call(query)
    .catch(err => {
      // TODO: if we got a `Duplicate primary key` error, it was likely a race condition
      // and we should succeed if we try again.
      logger.debug(`Failed user lookup or creation: ${err}`);
      throw new Error('User lookup or creation in database failed.');
    })
    .then(user => this._jwt.sign(user));
  }

  reql_call(query) {
    if (!this._parent._reql_conn.ready()) {
      return Promise.reject('Connection to database is down, cannot perform authentication.');
    }
    return query.run(this._parent._reql_conn.connection());
  }
}

class JWT {
  constructor(options) {
    this.duration = options.duration;
    this.algorithm = 'HS512';

    if (options.token_secret != null) {
      this.secret = new Buffer(options.token_secret, 'base64');
    } else {
      throw new Error(
        'No token_secret set! Try setting it in .hz/config.toml' +
        'or passing it to the Server constructor.');
    }
  }

  // A generated token contains the data:
  // { user: <uuid>, provider: <string> }
  sign(payload) {
    const token = jwt.sign(
      payload,
      this.secret,
      { algorithm: this.algorithm, expiresIn: this.duration }
    );

    return { token, payload };
  }

  verify(token) {
    return jwt.verifyAsync(token, this.secret, { algorithms: [ this.algorithm ] })
    .then(payload => { return { token, payload } });
  }
}

module.exports = { Auth };
