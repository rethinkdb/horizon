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

  // Can't use objects in primary keys, so convert those to JSON in the db (deterministically)
  authKey(provider, info) {
    if (info === null || Array.isArray(info) || typeof info !== 'object') {
      return [provider, info];
    } else {
      const r = this.context.horizon.r;
      return [provider, r.expr(info).toJSON()];
    }
  }

  newUserRow(id) {
    return {
      id,
      groups: ['default', this.options.newUserGroup],
    };
  }

  // TODO: maybe we should write something into the user data to track open sessions/tokens
  generate(provider, info) {
    const r = this.context.horizon.r;
    return Promise.resolve().then(() => {
      const key = this.authKey(provider, info);
      const db = r.db(this.context.horizon.options.projectName);

      const insert = (table, row) =>
        db.table(table)
          .insert(row, {conflict: 'error', returnChanges: 'always'})
          .bracket('changes')(0)('new_val');

      let query = db.table('users')
                    .get(db.table('hz_users_auth').get(key)('user_id'))
                    .default(r.error('User not found and new user creation is disabled.'));

      if (this.options.createNewUsers) {
        query = insert('hz_users_auth', {id: key, user_id: r.uuid()})
          .do((authUser) => insert('users', this.newUserRow(authUser('user_id'))));
      }

      return query.run(this.context.horizon.conn());
    }).then((user) =>
      this.tokens.sign({id: user.id, provider})
    ).catch((err) => {
      // TODO: if we got a `Duplicate primary key` error, it was likely a race condition
      // and we should succeed if we try again.
      this.context.horizon.events.emit('log', 'debug',
        `Failed user lookup or creation: ${err}`);
      throw new Error('User lookup or creation in database failed.');
    });
  }
}


module.exports = Auth;
