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

function facebook(horizon, rawOptions) {
  const options = Joi.attempt(rawOptions, optionsSchema);
  const client_id = options.id;
  const client_secret = options.secret;
  const provider = options.path;

  // Facebook requires inspect requests to use a separate app access token
  let appToken;

  const makeAppTokenRequest = () =>
    https.request(
      url.format({protocol: 'https',
                  host: 'graph.facebook.com',
                  pathname: '/oauth/access_token',
                  query: {client_id, client_secret, grant_type: 'client_credentials'}}));

  authUtils.run_request(makeAppTokenRequest(), (err, body) => {
    const parsed = body && querystring.parse(body);
    appToken = parsed && parsed.access_token;

    if (err) {
      horizon.events.emit('log', 'error', `Failed to obtain "${provider}" app token: ${err}`);
    } else if (!appToken) {
      horizon.events.emit('log', 'error',
        `Could not parse access token from API response: ${body}`);
    }
  });

  const oauthOptions = {horizon, provider};

  oauthOptions.makeAcquireUrl = (state, redirect_uri) =>
    url.format({protocol: 'https',
                 host: 'www.facebook.com',
                 pathname: '/dialog/oauth',
                 query: {client_id, state, redirect_uri, response_type: 'code'}});

  oauthOptions.makeTokenRequest = (code, redirect_uri) => {
    const req = https.request({method: 'POST',
                                host: 'graph.facebook.com',
                                path: '/v2.3/oauth/access_token'});
    req.write(querystring.stringify({code, redirect_uri, client_id, client_secret}));
    return req;
  };

  oauthOptions.makeInspectRequest = (input_token) =>
    https.request(
      url.format({protocol: 'https',
                   host: 'graph.facebook.com',
                   pathname: '/debug_token',
                   query: {access_token: appToken, input_token}}));

  oauthOptions.extractId = (userInfo) =>
    userInfo && userInfo.data && userInfo.data.user_id;

  authUtils.oauth2(oauthOptions);
}

module.exports = facebook;
