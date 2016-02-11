'use strict';

const logger = require('../logger');

const cookie = require('cookie');
const crypto = require('crypto');
const extend = require('util')._extend;
const https = require('https');
const Joi = require('joi');
const querystring = require('querystring');
const url = require('url');

const do_redirect = (res, redirect_url) => {
  logger.debug(`Redirecting user to ${redirect_url}`);
  res.writeHead(302, { Location: redirect_url });
  res.end();
};

const extend_url_query = (path, query) => {
  const path_copy = extend({ }, path);
  if (path_copy.query === null) {
    path_copy.query = query;
  } else {
    path_copy.query = extend({ }, path_copy.query);
    path_copy.query = extend(path_copy.query, query);
  }
  return path_copy;
};

const do_get = (get_url, cb) => {
  logger.debug(`oauth performing GET: ${get_url}`);
  const options = url.parse(get_url);
  options.headers = { 'accept': 'application/json', 'user-agent': 'node' };
  https.get(options, (req) => {
    const chunks = [];
    req.on('data', (data) => {
      chunks.push(data);
    });
    req.on('end', () => {
      cb(null, chunks.join(''));
    });
  }).on('error', (err) => {
    cb(err);
  });
};

const try_json_parse = (data) => {
  try {
    return JSON.parse(data);
  } catch (err) {
    // Do nothing - just return undefined
  }
};

const nonce_cookie = (name) => `${name}_fusion_nonce`;

const make_nonce = (cb) => crypto.randomBytes(64, (err, res) => {
  if (!err) {
    cb(err, res.toString('base64'));
  } else {
    cb(err, res);
  }
});

const nonce_to_state = (nonce) => crypto.createHash('sha256').update(nonce, 'base64').digest('base64');

const set_nonce = (res, name, nonce) =>
  res.setHeader('set-cookie',
                cookie.serialize(nonce_cookie(name), nonce,
                                 { maxAge: 3600, secure: true, httpOnly: true }));

const clear_nonce = (res, name) =>
  res.setHeader('set-cookie',
                cookie.serialize(nonce_cookie(name), 'invalid',
                                 { maxAge: -1, secure: true, httpOnly: true }));

const get_nonce = (req, name) => {
  const cookies = req.headers['cookie'];
  const field = nonce_cookie(name);
  if (cookies) {
    logger.debug(`Checking cookie: ${cookies}`);
    const value = cookie.parse(cookies);
    return value[field];
  }
};

const options_schema = Joi.object({
  fusion: Joi.object().required(),
  provider: Joi.string().required(),
  make_acquire_url: Joi.func().arity(1).required(), // take `state` and `return_url`, return string
  make_token_request: Joi.func().arity(2).required(), // take `code` and `return_url`, return request
  make_inspect_request: Joi.func().arity(1).required(), // take `access_token`, return request
  extract_id: Joi.func().arity(1).required(), // take `body`, return value
}).unknown(false);

const oauth_common = (raw_options) => {
  const options = Joi.attempt(raw_options, options_schema);

  logger.debug(`oauth_common options: ${JSON.stringify(options)}`);

  const fusion = options.fusion;
  const provider = options.provider;
  const make_acquire_url = options.make_acquire_url;
  const make_token_request = options.make_token_request;
  const make_inspect_request = options.make_inspect_request;
  const extract_id = options.extract_id;

  const self_url = (host, path) =>
    url.format({ protocol: 'https', host: host, pathname: path });

  const make_success_url = (fusion_token) =>
    url.format(extend_url_query(fusion._auth._success_redirect, { fusion_token }));

  const make_failure_url = (fusion_error) =>
    url.format(extend_url_query(fusion._auth._failure_redirect, { fusion_error }));

  fusion.add_http_handler(provider, (req, res) => {
    const request_url = url.parse(req.url, true);
    const return_url = self_url(req.headers.host, request_url.pathname);
    const code = request_url.query && request_url.query.code;

    logger.debug(`oauth request: ${JSON.stringify(request_url)}`);
    if (!code) {
      // We need to redirect to the API to acquire a token, then come back and try again
      // Generate a nonce to track this client session to prevent CSRF attacks
      make_nonce((nonce_err, nonce) => {
        if (nonce_err) {
          logger.error(`Error creating nonce for oauth state: ${nonce_err}`);
          res.statusCode = 503;
          res.end('error generating nonce');
        } else {
          set_nonce(res, fusion._name, nonce);
          do_redirect(res, make_acquire_url(nonce_to_state(nonce), return_url));
        }
      });
    } else {
      // Make sure this is the same client who obtained the code to prevent CSRF attacks
      const nonce = get_nonce(req, fusion._name);
      const state = request_url.query.state;

      if (!nonce || !state || state !== nonce_to_state(nonce)) {
        do_redirect(res, make_failure_url('session expired'));
      } else {
        // We have the user code, turn it into an access token
        run_request(make_token_request(code, return_url), (err1, body) => {
          const info = try_json_parse(body);
          const access_token = info && info.access_token;

          if (err1) {
            logger.error(`Error contacting oauth API: ${err1}`);
            res.statusCode = 503;
            res.end('oauth provider error');
          } else if (!access_token) {
            logger.error(`Bad JSON data from oauth API: ${body}`);
            res.statusCode = 500;
            res.end('unparseable token response');
          } else {
            // We have the user access token, get info on it so we can find the user
            run_request(make_inspect_request(access_token), (err2, inner_body) => {
              const inner_info = try_json_parse(inner_body);
              const user_id = inner_info && extract_id(inner_info);

              if (err2) {
                logger.error(`Error contacting oauth API: ${err2}`);
                res.statusCode = 503;
                res.end('oauth provider error');
              } else if (!user_id) {
                logger.error(`Bad JSON data from oauth API: ${inner_body}`);
                res.statusCode = 500;
                res.end('unparseable inspect response');
              } else {
                fusion._auth.generate_jwt(provider, user_id, (err3, jwt) => {
                  // Clear the nonce just so we aren't polluting clients' cookies
                  clear_nonce(res, fusion._name);
                  do_redirect(res, err3 ?
                    make_failure_url('invalid user') :
                    make_success_url(jwt));
                });
              }
            });
          }
        });
      }
    }
  });
};

module.exports = add;
