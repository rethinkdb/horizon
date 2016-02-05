'use strict';

const logger = require('./logger');
const options_schema = require('./schema/server_options').auth;

const assert = require('assert');
const Joi = require('joi');
const jwt = require('jsonwebtoken');
const pem = require('pem');
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

    server.add_http_handler('public_key', (req, res) => {
      if (this._public_key !== undefined) {
        res.end(this._public_key);
      } else {
        res.statusCode = 503;
        res.end('Fusion server is starting up, authentication is not ready.');
      }
    });

    this._success_redirect = url.parse(options.success_redirect);
    this._failure_redirect = url.parse(options.failure_redirect);
    this._duration = options.duration;
    this._create_new_users = options.create_new_users;
    this._new_user_group = options.new_user_group;
    this._allow_anonymous = options.allow_anonymous;
    this._allow_unauthenticated = options.allow_unauthenticated;

    this._parent = server;

    // TODO: we need to persist the private key such that all fusion servers in
    // the deployment use the same keypair. Thus, disconnected clients can
    // reconnect through any fusion server - useful behind a load balancer.
    this._ready_promise = new Promise((resolve) =>
      pem.createPrivateKey((err, res) => {
        assert.ifError(err);
        this._private_key = res.key;
        pem.getPublicKey(res.key, (err2, res2) => {
          assert.ifError(err2);
          this._public_key = res2.publicKey;
          resolve();
        });
      }));
  }

  is_ready() {
    return this._public_key !== undefined;
  }

  ready() {
    return this._ready_promise;
  }

  // A generated token contains the data:
  // { user: <uuid>, provider: <string> }
  _jwt_from_user(user, provider) {
    return jwt.sign({ user, provider },
                    this._private_key,
                    { expiresIn: this._duration });
  }

  // TODO: maybe we should write something into the user data to track open sessions/tokens
  generate_jwt(provider, info, cb) {
    const key = auth_key(provider, info);
    let query = r.db('fusion_internal').table('users_auth').get(key);

    if (this._create_new_users) {
      query = query.default(r.uuid().do((user_id) =>
                r.db('fusion_internal').table('users_auth').insert({ id: key, user_id },
                                                                   { returnChanges: true })
                 .do((res) =>
                   r.branch(res('inserted').eq(1),
                     r.db('fusion_internal').table('users')
                      .insert({ id: user_id, groups: [ this._new_user_group ] })
                      .do((res2) =>
                        r.branch(res2('inserted').eq(1),
                          res('changes')(0)('new_val'),
                          r.error(res2('first_error'))
                        )),
                     r.error(res('first_error'))
                   )
                 )
             ));
    } else {
      query = query.default(r.error('User not found and new user creation is disabled.'));
    }

    this.reql_call(query, (err, res) => {
      logger.debug(`User lookup/creation err: ${err}, res: ${res}`);
      if (err) {
        // TODO: if we got a `Duplicate primary key` error, it was likely a race condition
        // and we should succeed if we try again.
        logger.debug('Failed user lookup or creation: ${err}');
        cb(new Error('User lookup or creation in database failed.'));
      } else {
        cb(null, this._jwt_from_user(res.user_id, provider));
      }
    });
  }

  generate_anon_jwt(cb) {
    if (!this._allow_anonymous) {
      cb(new Error('Anonymous connections are not allowed.'));
    }

    const query = r.db('fusion_internal').table('users')
                   .insert({ group: this._new_user_group });

    this.reql_call(query, (err, res) => {
      if (err) {
        logger.error('Failed anonymous user creation: ${err}');
        cb(new Error('Anonymous user creation in database failed.'));
      } else {
        cb(null, this._jwt_from_user(res.id, null));
      }
    });
  }

  generate_unauth_jwt(cb) {
    if (!this._allow_unauthenticated) {
      cb(new Error('Unauthenticated connections are not allowed.'));
    } else {
      cb(null, this._jwt_from_user(null, null));
    }
  }

  verify_jwt(token, cb) {
    jwt.verify(token, this._public_key, cb);
  }

  reql_call(query, cb) {
    if (!this._parent._reql_conn.ready()) {
      cb(new Error('Connection to database is down, cannot perform authentication.'));
    } else {
      query.run(this._parent._reql_conn.get_connection(), cb);
    }
  }
}

module.exports = { Auth };
