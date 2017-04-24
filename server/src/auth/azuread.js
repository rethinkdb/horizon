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
  tenant: Joi.string().required(),
  resource: Joi.string().required(),
}).unknown(false);

function azuread(horizon, raw_options) {
  const options = Joi.attempt(raw_options, options_schema);
  const client_id = options.id;
  const client_secret = options.secret;
  const provider = options.path;

  const oauth_options = { horizon, provider };

  oauth_options.make_acquire_url = (state, redirect_uri) =>
    url.format({
      protocol: 'https',
      host: 'login.microsoftonline.com',
      pathname: `/${options.tenant}/oauth2/authorize`,
      query: { client_id, redirect_uri, state, response_type: 'code', response_mode: 'query' },
      body: { response_type: 'code' }
    });

  oauth_options.make_token_request = (code, redirect_uri) => {
    const body_params = querystring.stringify({
      grant_type: 'authorization_code', client_id, client_secret, redirect_uri, code,
      resource: options.resource
    });
    const path = `/${options.tenant}/oauth2/token`;
    const req = https.request({
      method: 'POST',
      port: 443,
      host: 'login.microsoftonline.com',
      path: path,
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'Content-Length': body_params.length
      }
    });

    req.write(body_params);
    return req;
  };  

  oauth_options.extract_id = (user_info) => user_info && user_info.id;

  auth_utils.oauth2(oauth_options);
}

module.exports = azuread;
