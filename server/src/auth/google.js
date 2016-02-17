'use strict';

const logger = require('../logger');
const auth_utils = require('./utils');

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

  const oauth_options = { fusion, provider };

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
};

module.exports = add;
