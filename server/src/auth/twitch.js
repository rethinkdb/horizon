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

function twitch(horizon, raw_options) {
  const options = Joi.attempt(raw_options, options_schema);
  const client_id = options.id;
  const client_secret = options.secret;
  const provider = options.path;

  const oauth_options = { horizon, provider };

  oauth_options.make_acquire_url = (state, redirect_uri) =>
    url.format({ protocol: 'https',
                 host: 'api.twitch.tv',
                 pathname: '/kraken/oauth2/authorize',
                 query: { client_id, redirect_uri, state, response_type: 'code', scope: 'user_read' } });

  oauth_options.make_token_request = (code, redirect_uri) => {
    const req = https.request({ method: 'POST',
                                host: 'api.twitch.tv',
                                path: '/kraken/oauth2/token' });
    req.write(querystring.stringify({
      client_id, redirect_uri, client_secret, code,
      grant_type: 'authorization_code' }));
    return req;
  };

  oauth_options.make_inspect_request = (access_token) => {
    logger.debug(`using access token: ${access_token}`);
    return https.request({ host: 'api.twitch.tv',
                           path: '/kraken/user',
                           headers: { authorization: `OAuth ${access_token}` } });
  };

  oauth_options.extract_id = (user_info) => user_info && user_info._id;

  auth_utils.oauth2(oauth_options);
}

module.exports = twitch;
