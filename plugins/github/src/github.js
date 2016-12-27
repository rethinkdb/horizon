'use strict';

const authUtils = require('@horizon/plugin-utils').auth;

const https = require('https');
const Joi = require('joi');
const querystring = require('querystring');
const url = require('url');

const optionsSchema = Joi.object().keys({
  path: Joi.string().required(),
  id: Joi.string().required(),
  secret: Joi.string().required(),
}).unknown(false);

function github(horizon, rawOptions) {
  const options = Joi.attempt(rawOptions, optionsSchema);
  const client_id = options.id;
  const client_secret = options.secret;
  const provider = options.path;

  const oauthOptions = {horizon, provider};

  oauthOptions.makeAcquireUrl = (state, redirect_uri) =>
    url.format({protocol: 'https',
                host: 'github.com',
                pathname: '/login/oauth/authorize',
                query: {client_id, redirect_uri, state}});

  oauthOptions.makeTokenRequest = (code, redirect_uri) => {
    const req = https.request({method: 'POST',
                               host: 'github.com',
                               path: '/login/oauth/access_token',
                               headers: {accept: 'application/json'}});

    req.write(querystring.stringify({code, client_id, client_secret, redirect_uri}));

    return req;
  };

  oauthOptions.makeInspectRequest = (access_token) =>
    https.request({host: 'api.github.com',
                    path: `/user?${querystring.stringify({access_token})}`,
                    headers: {'user-agent': 'node.js'}});

  oauthOptions.extractId = (userInfo) => userInfo && userInfo.id;

  authUtils.oauth2(oauthOptions);
}

module.exports = github;
