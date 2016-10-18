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

function twitch(horizon, rawOptions) {
  const options = Joi.attempt(rawOptions, optionsSchema);
  const client_id = options.id;
  const client_secret = options.secret;
  const provider = options.path;

  const oauthOptions = {horizon, provider};

  oauthOptions.makeAcquireUrl = (state, redirect_uri) =>
    url.format({protocol: 'https',
                host: 'api.twitch.tv',
                pathname: '/kraken/oauth2/authorize',
                query: {client_id, redirect_uri, state, response_type: 'code', scope: 'user_read'}});

  oauthOptions.makeTokenRequest = (code, redirect_uri) => {
    const req = https.request({method: 'POST',
                                host: 'api.twitch.tv',
                                path: '/kraken/oauth2/token'});
    req.write(querystring.stringify({
      client_id, redirect_uri, client_secret, code,
      grant_type: 'authorization_code'}));
    return req;
  };

  oauthOptions.makeInspectRequest = (access_token) => {
    horizon.events.emit('log', 'debug', `using access token: ${access_token}`);
    return https.request({host: 'api.twitch.tv',
                           path: '/kraken/user',
                           headers: {authorization: `OAuth ${access_token}`}});
  };

  oauthOptions.extractId = (userInfo) => userInfo && userInfo._id;

  authUtils.oauth2(oauthOptions);
}

module.exports = twitch;
