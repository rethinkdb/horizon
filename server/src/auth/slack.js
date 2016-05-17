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

function slack(horizon, raw_options) {
  const options = Joi.attempt(raw_options, options_schema);
  const client_id = options.id;
  const client_secret = options.secret;
  const provider = options.path;
  const scope = options && options.scope || 'identify';
  const team = options && options.team || '';

  const oauth_options = {
    horizon,
    provider,
  };

  oauth_options.make_acquire_url = (state, redirect_uri) =>
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

  oauth_options.make_token_request = (code, redirect_uri) =>
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

  oauth_options.make_inspect_request = (access_token) =>
    https.request({
      host: 'slack.com',
      path: `/api/auth.test?${querystring.stringify({ token: access_token })}`,
      headers: {
        'Content-Type': 'application/json',
        'user-agent': 'node.js',
      },
    });

  oauth_options.extract_id = (user_info) => user_info && user_info.user_id;

  auth_utils.oauth2(oauth_options);
}

module.exports = slack;
