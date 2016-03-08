'use strict';

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

function github(horizon, raw_options) {
  const options = Joi.attempt(raw_options, options_schema);
  const client_id = options.id;
  const client_secret = options.secret;
  const provider = options.path;

  const oauth_options = { horizon, provider };

  oauth_options.make_acquire_url = (state, redirect_uri) =>
    url.format({ protocol: 'https',
                 host: 'github.com',
                 pathname: '/login/oauth/authorize',
                 query: { client_id, redirect_uri, state } });

  oauth_options.make_token_request = (code, redirect_uri) => {
    const req = https.request({ method: 'POST',
                                host: 'github.com',
                                path: '/login/oauth/access_token',
                                headers: { accept: 'application/json' } });

    req.write(querystring.stringify({ code, client_id, client_secret, redirect_uri }));

    return req;
  };

  oauth_options.make_inspect_request = (access_token) =>
    https.request({ host: 'api.github.com',
                    path: `/user?${querystring.stringify({ access_token })}`,
                    headers: { 'user-agent': 'node.js' } });

  oauth_options.extract_id = (user_info) => user_info && user_info.id;

  auth_utils.oauth2(oauth_options);
}

module.exports = github;
