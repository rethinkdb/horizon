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

function slack(horizon, rawOptions) {
  const options = Joi.attempt(rawOptions, optionsSchema);
  const client_id = options.id;
  const client_secret = options.secret;
  const provider = options.path;
  const scope = options && options.scope || 'identify';
  const team = options && options.team || '';

  const oauthOptions = {horizon, provider};

  oauthOptions.makeAcquireUrl = (state, redirect_uri) =>
    url.format({
      protocol: 'https',
      host: 'slack.com',
      pathname: '/oauth/authorize',
      query: {
        client_id,
        redirect_uri,
        state,
        scope,
        team,
      },
    });

  oauthOptions.makeTokenRequest = (code, redirect_uri) =>
    https.request({
      method: 'POST',
      host: 'slack.com',
      path: `/api/oauth.access?${querystring.stringify({
        code,
        client_id,
        client_secret,
        redirect_uri,
      })}`,
      headers: {
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
    });

  oauthOptions.makeInspectRequest = (token) =>
    https.request({
      host: 'slack.com',
      path: `/api/auth.test?${querystring.stringify({token})}`,
      headers: {
        'Content-Type': 'application/json',
        'user-agent': 'node.js',
      },
    });

  oauthOptions.extractId = (userInfo) => userInfo && userInfo.user_id;

  authUtils.oauth2(oauthOptions);
}

module.exports = slack;
