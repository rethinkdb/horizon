'use strict';

const logger = require('./logger');
const options_schema = require('./schema/server_options').auth;
const writes = require('./endpoint/writes');

const Joi = require('joi');
const Promise = require('bluebird');
const jwt = Promise.promisifyAll(require('jsonwebtoken'));
const r = require('rethinkdb');
const url = require('url');


class JWT {
  constructor(options) {
    this.duration = options.duration;
    this.algorithm = 'HS512';

    if (options.token_secret != null) {
      this.secret = new Buffer(options.token_secret, 'base64');
    } else {
      throw new Error(
        'No token_secret set! Try setting it in .hz/secrets.toml ' +
        'or passing it to the Server constructor.');
    }
  }

  // A generated token contains the data:
  // { id: <uuid>, provider: <string> }
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
    .then((payload) => ({ token, payload }));
  }
}


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
      return this._jwt.verify(this._jwt.sign({ id: null, provider: request.method }).token);
    case 'anonymous':
      if (!this._allow_anonymous) {
        throw new Error('Anonymous connections are not allowed.');
      }
      return this.generate(request.method, r.uuid());
    default:
      throw new Error(`Unknown handshake method "${request.method}"`);
    }
  }

  // Can't use objects in primary keys, so convert those to JSON in the db (deterministically)
  auth_key(provider, info) {
    if (info === null || Array.isArray(info) || typeof info !== 'object') {
      return [ provider, info ];
    } else {
      return [ provider, r.expr(info).toJSON() ];
    }
  }

  new_user_row(id) {
    return {
      id,
      groups: [ 'default', this._new_user_group ],
      [writes.version_field]: 0,
    };
  }

  // TODO: maybe we should write something into the user data to track open sessions/tokens
  generate(provider, info) {
    return Promise.resolve().then(() => {
      const key = this.auth_key(provider, info);
      const db = r.db(this._parent._name);

      const insert = (table, row) =>
        db.table(table)
          .insert(row, { conflict: 'error', returnChanges: 'always' })
          .bracket('changes')(0)('new_val');

      let query = db.table('users')
                    .get(db.table('hz_users_auth').get(key)('user_id'))
                    .default(r.error('User not found and new user creation is disabled.'));

      if (this._create_new_users) {
        query = insert('hz_users_auth', { id: key, user_id: r.uuid() })
          .do((auth_user) => insert('users', this.new_user_row(auth_user('user_id'))));
      }

      return query.run(this._parent._reql_conn.connection()).catch((err) => {
        // TODO: if we got a `Duplicate primary key` error, it was likely a race condition
        // and we should succeed if we try again.
        logger.debug(`Failed user lookup or creation: ${err}`);
        throw new Error('User lookup or creation in database failed.');
      });
    }).then((user) =>
      this._jwt.sign({ id: user.id, provider })
    );
  }
}


module.exports = { Auth };
