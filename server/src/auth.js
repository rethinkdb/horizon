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
const auth_key = (provider, info) => {
  if (info === null || Array.isArray(info) || typeof info !== 'object') {
    return [ provider, info ];
  } else {
    return [ provider, r.expr(info).toJSON() ];
  }
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
        return this._jwt.verify(this._jwt.sign(request.method));
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
  generate(provider, id) {
    const key = auth_key(provider, id);
    const auth_table = r.db('horizon_internal').table('users_auth');
    const users_table = r.db('horizon_internal').table('users');

    function insert(table, row) {
      return table
        .insert(row, { conflict: 'error', returnChanges: 'always' })
        .bracket('changes')(0)('new_val');
    }

    let query = auth_table.get(key);

    if (this._create_new_users) {
      query = insert(auth_table, { id: key, user_id: r.uuid() })
        .do(auth =>
          insert(users_table, { id: auth('user_id'), groups: [ this._new_user_group ] })
        );
    }
    else {
      query = query.default(r.error('User not found and new user creation is disabled.'));
    }

    return this.reql_call(query)
    .catch(err => {
      // TODO: if we got a `Duplicate primary key` error, it was likely a race condition
      // and we should succeed if we try again.
      logger.debug(`Failed user lookup or creation: ${err}`);
      throw new Error('User lookup or creation in database failed.');
    })
    .then(user => {
      this._jwt.sign(provider, user.id).then(token => {
        token.user = user;
        return token;
      })
    });
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
  sign(provider, user) {
    return jwt.sign(
      { user, provider },
      this.secret,
      { algorithm: this.algorithm, expiresIn: this.duration }
    );
  }

  verify(token) {
    return jwt.verifyAsync(token, this.secret, { algorithms: [ this.algorithm ] })
    .then(decoded => {
      decoded.token = token;
      return decoded;
    });
  }
}

module.exports = { Auth };
