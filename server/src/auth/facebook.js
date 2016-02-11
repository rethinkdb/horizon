'use strict';

const logger = require('../logger');
const oauth = require('./oauth');

const https = require('https');
const Joi = require('joi');
const querystring = require('querystring');
const url = require('url');

const options_schema = Joi.object().keys({
  client_id: Joi.string().required(),
  client_secret: Joi.string().required(),
  path: Joi.string().required(),
}).unknown(false);

const add = (fusion, raw_options) => {
  const options = Joi.attempt(raw_options, options_schema);
  const client_id = options.client_id;
  const client_secret = options.client_secret;
  const provider = options.path;

  // Facebook requires inspect requests to use a separate app access token
  let app_token;

  const make_app_token_request = () => {
    return https.request(
      url.format({ protocol: 'https',
                   host: 'graph.facebook.com',
                   pathname: '/oauth/access_token',
                   query: { client_id, client_secret, grant_type: 'client_credentials' } }));
  }

  oauth.run_request(make_app_token_request(), (err, body) => {
    const parsed = body && querystring.parse(body);
    app_token = parsed && parsed.access_token;

    if (err) {
      logger.error(`Failed to obtain "${provider}" app token: ${err}`);
    } else if (!app_token) {
      logger.error(`Could not parse access token from API response: ${body}`);
    }
  });

  const oauth_options = { fusion, provider };

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

  oauth_options.make_inspect_request = (input_token) => {
    return https.request(
      url.format({ protocol: 'https',
                   host: 'graph.facebook.com',
                   pathname: '/debug_token',
                   query: { access_token: app_token, input_token } }));
  };

  oauth_options.extract_id = (user_info) =>
    user_info && user_info.data && user_info.data.user_id;

  oauth(oauth_options);
};

module.exports = add;
