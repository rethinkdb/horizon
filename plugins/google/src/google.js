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

function google(horizon, rawOptions) {
  const options = Joi.attempt(rawOptions, optionsSchema);
  const client_id = options.id;
  const client_secret = options.secret;
  const provider = options.path;

  const oauthOptions = {horizon, provider};

  oauthOptions.makeAcquireUrl = (state, redirect_uri) =>
    url.format({protocol: 'https',
                 host: 'accounts.google.com',
                 pathname: '/o/oauth2/v2/auth',
                 query: {client_id, redirect_uri, state, response_type: 'code', scope: 'profile'}});

  oauthOptions.makeTokenRequest = (code, redirect_uri) => {
    const query_params = querystring.stringify({
      code, client_id, client_secret, redirect_uri,
      grant_type: 'authorization_code'});
    const path = `/oauth2/v4/token?${query_params}`;
    return https.request({method: 'POST', host: 'www.googleapis.com', path});
  };

  oauthOptions.makeInspectRequest = (access_token) => {
    horizon.events.emit('log', 'debug', `using access token: ${access_token}`);
    const path = `/oauth2/v1/userinfo?${querystring.stringify({access_token})}`;
    return https.request({host: 'www.googleapis.com', path});
  };

  oauthOptions.extractId = (userInfo) => userInfo && userInfo.id;

  authUtils.oauth2(oauthOptions);
}

module.exports = google;
