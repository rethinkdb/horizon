'use strict';

const logger = require('./logger');
const options_schema = require('./schema/server_options').auth;
const writes = require('./endpoint/writes');

const Joi = require('joi');
const jwt = require('jsonwebtoken');
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

    this._success_redirect = url.parse(options.success_redirect);
    this._failure_redirect = url.parse(options.failure_redirect);
    this._duration = options.duration;
    this._create_new_users = options.create_new_users;
    this._new_user_group = options.new_user_group;
    this._allow_anonymous = options.allow_anonymous;
    this._allow_unauthenticated = options.allow_unauthenticated;

    this._parent = server;

    if (options.token_secret != null) {
      this._hmac_secret = new Buffer(options.token_secret, 'base64');
    } else {
      throw new Error(
        'No token_secret set! ' +
        'Try setting it in .hz/config.toml or passing it ' +
        'to the Server constructor.');
    }
  }

  // A generated token contains the data:
  // { user: <uuid>, provider: <string> }
  _jwt_from_user(user, provider) {
    return jwt.sign({ user, provider },
                    this._hmac_secret,
                    { expiresIn: this._duration,
                      algorithm: 'HS512' });
  }

  new_user_row(id) {
    return {
      id,
      groups: [ 'default', this._new_user_group ],
      [writes.version_field]: 0,
    };
  }

  // TODO: maybe we should write something into the user data to track open sessions/tokens
  generate_jwt(provider, info, cb) {
    const key = auth_key(provider, info);
    let query = r.db('horizon_internal').table('users_auth').get(key);

    if (this._create_new_users) {
      query = query.default(r.uuid().do((user_id) =>
                r.db('horizon_internal').table('users_auth').insert({ id: key, user_id },
                                                                   { returnChanges: true })
                 .do((res) =>
                   r.branch(res('inserted').eq(1),
                     r.db('horizon_internal').table('users')
                      .insert(this.new_user_row(user_id))
                      .do((res2) =>
                        r.branch(res2('inserted').eq(1),
                          res2('changes')(0)('new_val'),
                          r.error(res2('first_error'))
                        )),
                     r.error(res('first_error'))
                   )
                 )
             ));
    } else {
      query = query.default(r.error('User not found and new user creation is disabled.'));
    }

    this.reql_call(query).then((res) => {
      cb(null, this._jwt_from_user(res.id, provider));
    }).catch((err) => {
      // TODO: if we got a `Duplicate primary key` error, it was likely a race condition
      // and we should succeed if we try again.
      logger.debug(`Failed user lookup or creation: ${err}`);
      cb(new Error('User lookup or creation in database failed.'));
    });
  }

  generate_anon_jwt(cb) {
    if (!this._allow_anonymous) {
      cb(new Error('Anonymous connections are not allowed.'));
    }

    const query = r.db('horizon_internal').table('users')
                   .insert(this.new_user_row(r.uuid()),
                           { returnChanges: 'always' })
                   .bracket('changes')(0)
                   .do((res) =>
                     r.branch(res('new_val').eq(null),
                              r.error(res('error')),
                              res('new_val')));

    this.reql_call(query).then((res) => {
      this.verify_jwt(this._jwt_from_user(res.id, null), cb);
    }).catch((err) => {
      logger.error(`Failed anonymous user creation: ${err.stack}`);
      cb(new Error('Anonymous user creation in database failed.'));
    });
  }

  generate_unauth_jwt(cb) {
    if (!this._allow_unauthenticated) {
      cb(new Error('Unauthenticated connections are not allowed.'));
    } else {
      this.verify_jwt(this._jwt_from_user(null, null), cb);
    }
  }

  verify_jwt(token, cb) {
    jwt.verify(token, this._hmac_secret, { algorithms: [ 'HS512' ] }, (err, decoded) => {
      if (err) {
        return cb(err);
      } else if (decoded.user === undefined || decoded.provider === undefined) {
        return cb(new Error('Invalid token data, "user" and "provider" must be specified.'));
      } else if (decoded.provider === null) {
        if (decoded.user === null) {
          if (!this._allow_unauthenticated) {
            return cb(new Error('Unauthenticated connections are not allowed.'));
          }
        } else if (!this._allow_anonymous) {
          return cb(new Error('Anonymous connections are not allowed.'));
        }
      }
      cb(null, token, decoded);
    });
  }

  reql_call(query) {
    if (!this._parent._reql_conn.ready()) {
      return Promise.reject(new Error('Connection to database is down, cannot perform authentication.'));
    } else {
      return query.run(this._parent._reql_conn.connection());
    }
  }
}

module.exports = { Auth };
