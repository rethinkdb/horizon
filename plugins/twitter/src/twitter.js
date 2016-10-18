'use strict';

const authUtils = require('./utils');

const Joi = require('joi');
const oauth = require('oauth');
const url = require('url');

const optionsSchema = Joi.object({
  path: Joi.string().required(),
  id: Joi.string().required(),
  secret: Joi.string().required(),
});

// Cache for request token secrets
const nonceCache = new Map();
const nonceCacheTtlMs = 60 * 60 * 1000;

const store_app_token = (nonce, token) => {
  const time = Date.now();
  const cutoff = time - nonceCacheTtlMs;
  const iter = nonceCache.entries();

  let item = iter.next();
  while (item.value && item.value[1].time < cutoff) {
    nonceCache.delete(item.value[0]);
    item = iter.next();
  }

  nonceCache.set(nonce, {time, token});
};

const getAppToken = (nonce) => {
  const res = nonceCache.get(nonce);
  nonceCache.delete(nonce);
  return res && res.token;
};

function twitter(context, rawOptions) {
  const options = Joi.attempt(rawOptions, optionsSchema);
  const provider = options.path;
  const consumer_key = options.id;
  const consumer_secret = options.secret;

  const oa = new oauth.OAuth('https://twitter.com/oauth/request_token',
                             'https://twitter.com/oauth/access_token',
                             consumer_key,
                             consumer_secret,
                             '1.0a',
                             '', // Callback URL, to be filled in per-user
                             'HMAC-SHA1');

  const user_info_url = 'https://api.twitter.com/1.1/account/verify_credentials.json';

  const make_success_url = (horizon_token) =>
    url.format(authUtils.extend_url_query(context.horizon.auth.successUrl, {horizon_token}));

  const make_failure_url = (horizon_error) =>
    url.format(authUtils.extend_url_query(context.horizon.auth.failureUrl, {horizon_error}));

  horizon.add_http_handler(provider, (req, res) => {
    const request_url = url.parse(req.url, true);
    const user_token = request_url.query && request_url.query.oauth_token;
    const verifier = request_url.query && request_url.query.oauth_verifier;

    horizon.events.emit('log', 'debug', `oauth request: ${JSON.stringify(request_url)}`);
    if (!user_token) {
      // Auth has not been started yet, determine our callback URL and register an app token for it
      // First generate a nonce to track this client session to prevent CSRF attacks
      authUtils.make_nonce((nonce_err, nonce) => {
        if (nonce_err) {
          horizon.events.emit('log', 'error', `Error creating nonce for oauth state: ${nonce_err}`);
          authUtils.do_redirect(res, make_failure_url('error generating nonce'));
        } else {
          oa._authorize_callback =
            url.format({protocol: 'https',
                         host: req.headers.host,
                         pathname: request_url.pathname,
                         query: {state: authUtils.nonce_to_state(nonce)}});

          oa.getOAuthRequestToken((err, app_token, app_token_secret, body) => {
            if (err || body.oauth_callback_confirmed !== 'true') {
              horizon.events.emit('log', 'error', `Error acquiring app oauth token: ${JSON.stringify(err)}`);
              authUtils.do_redirect(res, make_failure_url('error acquiring app oauth token'));
            } else {
              store_app_token(nonce, app_token_secret);
              authUtils.set_nonce(res, horizon._name, nonce);
              authUtils.do_redirect(res, url.format({protocol: 'https',
                                                       host: 'api.twitter.com',
                                                       pathname: '/oauth/authenticate',
                                                       query: {oauth_token: app_token}}));
            }
          });
        }
      });
    } else {
      // Make sure this is the same client who obtained the code to prevent CSRF attacks
      const nonce = authUtils.get_nonce(req, horizon._name);
      const state = request_url.query.state;
      const app_token = getAppToken(nonce);

      if (!nonce || !state || !app_token || state !== authUtils.nonce_to_state(nonce)) {
        authUtils.do_redirect(res, make_failure_url('session expired'));
      } else {
        oa.getOAuthAccessToken(user_token, app_token, verifier, (err, access_token, secret) => {
          if (err) {
            horizon.events.emit('log', 'error', `Error contacting oauth API: ${err}`);
            authUtils.do_redirect(res, make_failure_url('oauth provider error'));
          } else {
            oa.get(user_info_url, access_token, secret, (err2, body) => {
              const user_info = authUtils.try_json_parse(body);
              const user_id = user_info && user_info.id;

              if (err2) {
                horizon.events.emit('log', 'error', `Error contacting oauth API: ${err2}`);
                authUtils.do_redirect(res, make_failure_url('oauth provider error'));
              } else if (!user_id) {
                horizon.events.emit('log', 'error', `Bad JSON data from oauth API: ${body}`);
                authUtils.do_redirect(res, make_failure_url('unparseable inspect response'));
              } else {
                horizon._auth.generate(provider, user_id).nodeify((err3, jwt) => {
                  authUtils.clear_nonce(res, horizon._name);
                  authUtils.do_redirect(res, err3 ?
                    make_failure_url('invalid user') :
                    make_success_url(jwt.token));
                });
              }
            });
          }
        });
      }
    }
  });
}

module.exports = twitter;
