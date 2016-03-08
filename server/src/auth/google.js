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

function google(horizon, raw_options) {
  const options = Joi.attempt(raw_options, options_schema);
  const client_id = options.id;
  const client_secret = options.secret;
  const provider = options.path;

  const oauth_options = { horizon, provider };

  oauth_options.make_acquire_url = (state, redirect_uri) =>
    url.format({ protocol: 'https',
                 host: 'accounts.google.com',
                 pathname: '/o/oauth2/v2/auth',
                 query: { client_id, redirect_uri, state, response_type: 'code', scope: 'profile' } });

  oauth_options.make_token_request = (code, redirect_uri) => {
    const query_params = querystring.stringify({
      code, client_id, client_secret, redirect_uri,
      grant_type: 'authorization_code' });
    const path = `/oauth2/v4/token?${query_params}`;
    return https.request({ method: 'POST', host: 'www.googleapis.com', path });
  };

  oauth_options.make_inspect_request = (access_token) => {
    logger.debug(`using access token: ${access_token}`);
    const path = `/oauth2/v1/userinfo?${querystring.stringify({ access_token })}`;
    return https.request({ host: 'www.googleapis.com', path });
  };

  oauth_options.extract_id = (user_info) => user_info && user_info.id;

  auth_utils.oauth2(oauth_options);
}

module.exports = google;
