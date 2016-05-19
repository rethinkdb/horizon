'use strict';

const logger = require('../logger');

const cookie = require('cookie');
const crypto = require('crypto');
const Joi = require('joi');
const url = require('url');

const do_redirect = (res, redirect_url) => {
  logger.debug(`Redirecting user to ${redirect_url}`);
  res.writeHead(302, { Location: redirect_url });
  res.end();
};

const extend_url_query = (path, query) => {
  const path_copy = Object.assign({}, path);
  if (path_copy.query === null) {
    path_copy.query = query;
  } else {
    path_copy.query = Object.assign({}, path_copy.query);
    path_copy.query = Object.assign({}, path_copy.query, query);
  }
  return path_copy;
};

const run_request = (req, cb) => {
  logger.debug(`Initiating request to ${req._headers.host}${req.path}`);
  req.once('response', (res) => {
    const chunks = [];
    res.on('data', (data) => {
      chunks.push(data);
    });
    res.once('end', () => {
      if (res.statusCode !== 200) {
        cb(new Error(`Request returned status code: ${res.statusCode} (${res.statusMessage}): ${chunks.join('')}`));
      } else {
        cb(null, chunks.join(''));
      }
    });
  });
  req.once('error', (err) => {
    cb(err);
  });
  req.end();
};

const try_json_parse = (data) => {
  try {
    return JSON.parse(data);
  } catch (err) {
    // Do nothing - just return undefined
  }
};

const nonce_cookie = (name) => `${name}_horizon_nonce`;

const make_nonce = (cb) => crypto.randomBytes(64, (err, res) => {
  if (!err) {
    cb(err, res.toString('base64'));
  } else {
    cb(err, res);
  }
});

// TODO: this base64 encoding isn't URL-friendly
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
  const field = nonce_cookie(name);
  if (req.headers.cookie) {
    const value = cookie.parse(req.headers.cookie);
    return value[field];
  }
};

const options_schema = Joi.object({
  horizon: Joi.object().required(),
  provider: Joi.string().required(),
  make_acquire_url: Joi.func().arity(2).required(), // take `state` and `return_url`, return string
  make_token_request: Joi.func().arity(2).required(), // take `code` and `return_url`, return request
  make_inspect_request: Joi.func().arity(1).required(), // take `access_token`, return request
  extract_id: Joi.func().arity(1).required(), // take `user_info`, return value
}).unknown(false);

// Attaches an endpoint to the horizon server, providing an oauth2 redirect flow
const oauth2 = (raw_options) => {
  const options = Joi.attempt(raw_options, options_schema);

  const horizon = options.horizon;
  const provider = options.provider;
  const make_acquire_url = options.make_acquire_url;
  const make_token_request = options.make_token_request;
  const make_inspect_request = options.make_inspect_request;
  const extract_id = options.extract_id;

  const self_url = (host, path) =>
    url.format({ protocol: 'https', host: host, pathname: path });

  const make_success_url = (horizon_token) =>
    url.format(extend_url_query(horizon._auth._success_redirect, { horizon_token }));

  const make_failure_url = (horizon_error) =>
    url.format(extend_url_query(horizon._auth._failure_redirect, { horizon_error }));

  horizon.add_http_handler(provider, (req, res) => {
    const request_url = url.parse(req.url, true);
    const return_url = self_url(req.headers.host, request_url.pathname);
    const code = request_url.query && request_url.query.code;
    const error = request_url.query && request_url.query.error;

    logger.debug(`oauth request: ${JSON.stringify(request_url)}`);
    if (error) {
      const description = request_url.query.error_description || error;
      do_redirect(res, make_failure_url(description));
    } else if (!code) {
      // We need to redirect to the API to acquire a token, then come back and try again
      // Generate a nonce to track this client session to prevent CSRF attacks
      make_nonce((nonce_err, nonce) => {
        if (nonce_err) {
          logger.error(`Error creating nonce for oauth state: ${nonce_err}`);
          res.statusCode = 503;
          res.end('error generating nonce');
        } else {
          set_nonce(res, horizon._name, nonce);
          do_redirect(res, make_acquire_url(nonce_to_state(nonce), return_url));
        }
      });
    } else {
      // Make sure this is the same client who obtained the code to prevent CSRF attacks
      const nonce = get_nonce(req, horizon._name);
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
              const user_info = try_json_parse(inner_body);
              const user_id = user_info && extract_id(user_info);

              if (err2) {
                logger.error(`Error contacting oauth API: ${err2}`);
                res.statusCode = 503;
                res.end('oauth provider error');
              } else if (!user_id) {
                logger.error(`Bad JSON data from oauth API: ${inner_body}`);
                res.statusCode = 500;
                res.end('unparseable inspect response');
              } else {
                horizon._auth.generate(provider, user_id).nodeify((err3, jwt) => {
                  // Clear the nonce just so we aren't polluting clients' cookies
                  clear_nonce(res, horizon._name);
                  do_redirect(res, err3 ?
                    make_failure_url('invalid user') :
                    make_success_url(jwt.token));
                });
              }
            });
          }
        });
      }
    }
  });
};

module.exports = {
  oauth2,
  do_redirect, run_request,
  make_nonce, set_nonce, get_nonce, clear_nonce, nonce_to_state,
  extend_url_query,
  try_json_parse,
};
