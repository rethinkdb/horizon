'use strict';

const logger = require('../logger');
const auth_utils = require('./utils');

const https = require('https');
const Joi = require('joi');
const querystring = require('querystring');
const url = require('url');

const options_schema = Joi.object().keys({
  path: Joi.string().required(),
  id: Joi.string().required(),
  secret: Joi.string().required(),
}).unknown(false);

function facebook(horizon, raw_options) {
  const options = Joi.attempt(raw_options, options_schema);
  const client_id = options.id;
  const client_secret = options.secret;
  const provider = options.path;

  // Facebook requires inspect requests to use a separate app access token
  let app_token;

  const make_app_token_request = () =>
    https.request(
      url.format({ protocol: 'https',
                   host: 'graph.facebook.com',
                   pathname: '/oauth/access_token',
                   query: { client_id, client_secret, grant_type: 'client_credentials' } }));

  auth_utils.run_request(make_app_token_request(), (err, body) => {
    const parsed = body && querystring.parse(body);
    app_token = parsed && parsed.access_token;

    if (err) {
      logger.error(`Failed to obtain "${provider}" app token: ${err}`);
    } else if (!app_token) {
      logger.error(`Could not parse access token from API response: ${body}`);
    }
  });

  const oauth_options = { horizon, provider };

  oauth_options.make_acquire_url = (state, redirect_uri) =>
    url.format({ protocol: 'https',
                 host: 'www.facebook.com',
                 pathname: '/dialog/oauth',
                 query: { client_id, state, redirect_uri, response_type: 'code' } });

  oauth_options.make_token_request = (code, redirect_uri) => {
    const req = https.request({ method: 'POST',
                                host: 'graph.facebook.com',
                                path: '/v2.3/oauth/access_token' });
    req.write(querystring.stringify({ code, redirect_uri, client_id, client_secret }));
    return req;
  };

  oauth_options.make_inspect_request = (input_token) =>
    https.request(
      url.format({ protocol: 'https',
                   host: 'graph.facebook.com',
                   pathname: '/debug_token',
                   query: { access_token: app_token, input_token } }));

  oauth_options.extract_id = (user_info) =>
    user_info && user_info.data && user_info.data.user_id;

  auth_utils.oauth2(oauth_options);
}

module.exports = facebook;
