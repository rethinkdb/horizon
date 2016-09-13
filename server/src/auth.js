'use strict';

const logger = require('./logger');
const {authSchema} = require('./schema').auth;

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
      {algorithm: this.algorithm, expiresIn: this.duration}
    );

    return {token, payload};
  }

  verify(token) {
    return jwt.verifyAsync(token, this.secret, {algorithms: [this.algorithm]})
    .then((payload) => ({token, payload}));
  }
}


class Auth {
  constructor(projectName, rdbConnection, options) {
    // RSI: don't expose token_secret to plugins
    this.options = Joi.attempt(options, authSchema);
    this.rdbConnection = rdbConnection;
    this._jwt = new JWT(options);
    this.successUrl = url.parse(this.options.success_redirect);
    this.failureUrl = url.parse(this.options.failure_redirect);
  }

  handshake(request) {
    switch (request.method) {
    case 'token':
      return this._jwt.verify(request.token);
    case 'unauthenticated':
      if (!this.options.allow_unauthenticated) {
        throw new Error('Unauthenticated connections are not allowed.');
      }
      return this._jwt.verify(this._jwt.sign({id: null, provider: request.method}).token);
    case 'anonymous':
      if (!this.options.allow_anonymous) {
        throw new Error('Anonymous connections are not allowed.');
      }
      return this.generate(request.method, r.uuid());
    default:
      throw new Error(`Unknown handshake method "${request.method}"`);
    }
  }

  // Can't use objects in primary keys, so convert those to JSON in the db (deterministically)
  authKey(provider, info) {
    if (info === null || Array.isArray(info) || typeof info !== 'object') {
      return [provider, info];
    } else {
      return [provider, r.expr(info).toJSON()];
    }
  }

  newUserRow(id) {
    return {
      id,
      groups: ['default', this.options.new_user_group],
    };
  }

  // TODO: maybe we should write something into the user data to track open sessions/tokens
  generate(provider, info) {
    return Promise.resolve().then(() => {
      const conn = this.rdbConnection.connection();
      const key = this.authKey(provider, info);
      const db = r.db(this._parent.options.project_name);

      const insert = (table, row) =>
        db.table(table)
          .insert(row, {conflict: 'error', returnChanges: 'always'})
          .bracket('changes')(0)('new_val');

      let query = db.table('users')
                    .get(db.table('hz_users_auth').get(key)('user_id'))
                    .default(r.error('User not found and new user creation is disabled.'));

      if (this.options.create_new_users) {
        query = insert('hz_users_auth', {id: key, user_id: r.uuid()})
          .do((authUser) => insert('users', this.newUserRow(authUser('user_id'))));
      }

      return query.run(conn).catch((err) => {
        // TODO: if we got a `Duplicate primary key` error, it was likely a race condition
        // and we should succeed if we try again.
        logger.debug(`Failed user lookup or creation: ${err}`);
        throw new Error('User lookup or creation in database failed.');
      });
    }).then((user) =>
      this._jwt.sign({id: user.id, provider}));
  }
}


module.exports = {Auth};
