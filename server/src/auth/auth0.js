'use strict';

const auth_utils = require('./utils');
const logger = require('../logger');

const https = require('https');
const Joi = require('joi');
const url = require('url');

const options_schema = Joi.object().keys({
  path: Joi.string().required(),
  id: Joi.string().required(),
  secret: Joi.string().required(),
  host: Joi.string().required(),
}).unknown(false);

function auth0(horizon, raw_options) {
  const options = Joi.attempt(raw_options, options_schema);
  const response_type = 'token';
  const client_id = options.id;
  const client_secret = options.secret;
  const provider = options.path;
  const return_url = horizon._auth._success_redirect.href.slice(0, -1);
  const host = options.host;

  const self_url = (self_host, path) =>
    url.format({ protocol: 'https', host: self_host, pathname: path });

  const make_acquire_url = (state, redirect_uri) =>
    url.format({ protocol: 'https',
                 host: host,
                 pathname: '/authorize',
                 query: { response_type, client_id, redirect_uri, state } });

  const make_inspect_request = (access_token) =>
    https.request({ host: host,
                    path: '/userinfo',
                    headers: { Authorization: `Bearer ${access_token}` } });

  const extract_id = (user_info) => user_info && user_info.identities[0].user_id;

  const make_success_url = (horizon_token) =>
    url.format(auth_utils.extend_url_query(horizon._auth._success_redirect, { horizon_token }));

  const make_failure_url = (horizon_error) =>
    url.format(auth_utils.extend_url_query(horizon._auth._failure_redirect, { horizon_error }));

  horizon.add_http_handler(provider, (req, res) => {
    const request_url = url.parse(req.url, true);
    const access_token = request_url.query && request_url.query.access_token;
    const error = request_url.query && request_url.query.error;

    logger.debug(`oauth request: ${JSON.stringify(request_url)}`);
    if (error) {
      const description = request_url.query.error_description || error;
      auth_utils.do_redirect(res, make_failure_url(description));
    } else if (!access_token) {
      // We need to redirect to the API to acquire a token, then come back and try again
      // Generate a nonce to track this client session to prevent CSRF attacks
      auth_utils.make_nonce((nonce_err, nonce) => {
        if (nonce_err) {
          logger.error(`Error creating nonce for oauth state: ${nonce_err}`);
          res.statusCode = 503;
          res.end('error generating nonce');
        } else {
          auth_utils.set_nonce(res, horizon._name, nonce);
          auth_utils.do_redirect(res, make_acquire_url(auth_utils.nonce_to_state(nonce), return_url));
        }
      });
    } else {
      // Make sure this is the same client who obtained the code to prevent CSRF attacks
      const nonce = auth_utils.get_nonce(req, horizon._name);
      const state = request_url.query.state;

      if (!nonce || !state || state !== auth_utils.nonce_to_state(nonce)) {
        auth_utils.do_redirect(res, make_failure_url('session expired'));
      } else {
        // We have the user access token, get info on it so we can find the user
        auth_utils.run_request(make_inspect_request(access_token), (err2, inner_body) => {
          const user_info = auth_utils.try_json_parse(inner_body);
          const user_id = user_info && extract_id(user_info);

          if (err2) {
            logger.error(`Error contacting oauth API: ${err2}`);
            res.statusCode = 503;
            res.end('oauth provider error');
          } else if (!user_id) {
            logger.error(`Bad JSON data from oauth API: ${inner_body}`);
            res.statusCode = 500;
            res.end('unparseable inspect response');
          } else {
            horizon._auth.generate(provider, user_id).nodeify((err3, jwt) => {
              // Clear the nonce just so we aren't polluting clients' cookies
              auth_utils.clear_nonce(res, horizon._name);
              auth_utils.do_redirect(res, err3 ?
                make_failure_url('invalid user') :
                make_success_url(jwt.token));
            });
          }
        });
      }
    }
  });
}

module.exports = auth0;
