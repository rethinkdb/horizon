'use strict';

const {auth: authSchema} = require('./schema');

const Joi = require('joi');
const jwt = require('jsonwebtoken');
const url = require('url');

// Rather than create a class, capture the tokenSecret so it can't be
// inspected by plugins.
function tokens(options) {
  if (!options.tokenSecret) {
    throw new Error(
      'No tokenSecret set! Try setting it in .hz/secrets.toml ' +
      'or passing it to the Server constructor.');
  }

  const secret = new Buffer(options.tokenSecret, 'base64');
  const expiresIn = options.duration;
  const algorithm = 'HS512';

  return {
    sign: (payload) => ({
      token: jwt.sign(payload, secret, {algorithm, expiresIn}),
      payload,
    }),
    verify: (token) => ({
      token,
      payload: jwt.verify(token, secret, {algorithms: [algorithm]}),
    }),
  };
}

class Auth {
  constructor(context) {
    // RSI: don't expose tokenSecret to plugins
    this.context = context;
    this.options = Joi.attempt(this.context.horizon.options.auth, authSchema);
    this.tokens = tokens(this.options);
    this.successUrl = url.parse(this.options.successRedirect);
    this.failureUrl = url.parse(this.options.failureRedirect);

    const r = this.context.horizon.r;
    const projectName = this.context.horizon.options.projectName;
    this.usersTable = r.db(projectName).table('users');
    this.usersAuthTable = r.db(projectName).table('hz_users_auth');

    if (this.options.allowAnonymous && !this.options.createNewUsers) {
      throw new Error('Cannot allow anonymous users without new user creation.');
    }
  }

  handshake(request) {
    const r = this.context.horizon.r;
    return Promise.resolve().then(() => {
      switch (request.options.method) {
      case 'token':
        return this.tokens.verify(request.options.token);
      case 'unauthenticated':
        if (!this.options.allowUnauthenticated) {
          throw new Error('Unauthenticated connections are not allowed.');
        }
        return this.tokens.verify(this.tokens.sign({id: null, provider: request.options.method}).token);
      case 'anonymous':
        if (!this.options.allowAnonymous) {
          throw new Error('Anonymous connections are not allowed.');
        }
        return this.generate(request.options.method, r.uuid());
      default:
        throw new Error(`Unknown handshake method "${request.options.method}"`);
      }
    });
  }

  // TODO: maybe we should write something into the user data to track open sessions/tokens
  // Gets or creates an account linked with an auth provider account
  generate(provider, providerId, data) {
    const r = this.context.horizon.r;
    return Promise.resolve().then(() => {
      const key = this._authKey(provider, providerId);

      let query = this.usersTable.get(this.usersAuthTable.get(key)('user_id'));

      if (this.options.createNewUsers) {
        query = query.default(() =>
          r.uuid().do((id) =>
            // eslint-disable-next-line camelcase
            this.usersAuthTable.insert({id: key, user_id: id, data})
              .do((res) =>
                r.branch(res('errors').ne(0), r.error(res('first_error')),
                  this.usersTable.insert(this._newUserRow(id, data || {}))))
              .do(() => id)
          )
        );
      } else {
        query = query.default(
          r.error('User not found and new user creation is disabled.'));
      }

      return query.run(this.context.horizon.conn());
    }).then((userId) =>
      this.tokens.sign({id: userId, provider})
    ).catch((err) => {
      // TODO: if we got a `Duplicate primary key` error, it was likely a race condition
      // and we should succeed if we try again.
      this.context.horizon.events.emit('log', 'debug',
        `Failed user lookup or creation: ${err}`);
      throw new Error('User lookup or creation in database failed.');
    });
  }

  // TODO: add a function to connect an auth provider account with an existing account
  // connect(provider, providerId, data, userId)

  // Can't use objects in primary keys, so convert those to JSON in the db (deterministically)
  _authKey(provider, providerId) {
    if (providerId === null ||
        Array.isArray(providerId) ||
        typeof providerId !== 'object') {
      return [provider, providerId];
    } else {
      const r = this.context.horizon.r;
      return [provider, r.expr(providerId).toJSON()];
    }
  }

  _newUserRow(id, data) {
    return {
      id,
      data,
      groups: ['default', this.options.newUserGroup],
    };
  }
}


module.exports = Auth;
