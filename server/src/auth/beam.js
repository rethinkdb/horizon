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

function beam(horizon, raw_options) {
  const options = Joi.attempt(raw_options, options_schema);
  const client_id = options.id;
  const client_secret = options.secret;
  const provider = options.path;

  const oauth_options = { horizon, provider };

  oauth_options.make_acquire_url = (state, redirect_uri) =>
    url.format({ protocol: 'https',
                 host: 'beam.pro',
                 pathname: '/oauth/authorize',
                 query: { client_id, redirect_uri, state, response_type: 'code', scope: 'channel:details:self' } });

  oauth_options.make_token_request = (code, redirect_uri) => {
    const payload = JSON.stringify({client_id, redirect_uri, client_secret, code, grant_type: 'authorization_code' });
    const req = https.request({ method: 'POST',
                                host: 'beam.pro',
                                path: '/api/v1/oauth/token',
                                headers: { 'Content-type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
                              });
    req.write(payload);
    return req;
  };

  oauth_options.make_inspect_request = (access_token) => {
    logger.debug(`using access token: ${access_token}`);
    return https.request({ host: 'beam.pro',
                           path: '/api/v1/users/current',
                           headers: { authorization: `Bearer ${access_token}` } });
  };

  
  oauth_options.extract_id = (user_info) => user_info && user_info.id;

  auth_utils.oauth2(oauth_options);
}

module.exports = beam;
