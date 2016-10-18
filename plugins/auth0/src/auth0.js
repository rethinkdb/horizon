'use strict';

const authUtils = require('@horizon/plugin-utils').auth;

const https = require('https');
const querystring = require('querystring');
const url = require('url');

const Joi = require('joi');

const optionsSchema = Joi.object().keys({
  path: Joi.string().required(),
  id: Joi.string().required(),
  secret: Joi.string().required(),
  host: Joi.string().required(),
}).unknown(false);

function auth0(horizon, rawOptions) {
  const options = Joi.attempt(rawOptions, optionsSchema);
  const client_id = options.id;
  const client_secret = options.secret;
  const host = options.host;

  const makeAcquireUrl = (state, redirect_uri) =>
    url.format({protocol: 'https',
                 host: host,
                 pathname: '/authorize',
                 query: {response_type: 'code', client_id, redirect_uri, state}});

  const makeTokenRequest = (code, redirect_uri) => {
    const req = https.request({method: 'POST', host, path: '/oauth/token',
                               headers: {'Content-type': 'application/x-www-form-urlencoded'}});
    req.write(querystring.stringify({
      client_id, redirect_uri, client_secret, code,
      grant_type: 'authorization_code',
    }));
    return req;
  };

  const makeInspectRequest = (accessToken) =>
    https.request({host, path: '/userinfo',
                   headers: {Authorization: `Bearer ${accessToken}`}});

  const extractId = (userInfo) => userInfo && userInfo.user_id;


  authUtils.oauth2({
    horizon,
    provider: options.path,
    makeAcquireUrl,
    makeTokenRequest,
    makeInspectRequest,
    extractId,
  });
}

module.exports = auth0;
