'use strict';

const cookie = require('cookie');
const crypto = require('crypto');
const Joi = require('joi');
const url = require('url');

const doRedirect = (res, redirectUrl) => {
  res.writeHead(302, {Location: redirectUrl});
  res.end();
};

const extendUrlQuery = (path, query) => {
  const pathCopy = Object.assign({}, path);
  if (pathCopy.query === null) {
    pathCopy.query = query;
  } else {
    pathCopy.query = Object.assign({}, pathCopy.query);
    pathCopy.query = Object.assign({}, pathCopy.query, query);
  }
  return pathCopy;
};

const runRequest = (req, cb) => {
  req.once('response', (res) => {
    const chunks = [];
    res.on('data', (data) => {
      chunks.push(data);
    });
    res.once('end', () => {
      if (res.statusCode !== 200) {
        cb(new Error(`Request returned status code: ${res.statusCode} ` +
                     `(${res.statusMessage}): ${chunks.join('')}`));
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

const tryJsonParse = (data) => {
  try {
    return JSON.parse(data);
  } catch (err) {
    // Do nothing - just return undefined
  }
};

const nonceCookie = (name) => `${name}_horizon_nonce`;

const makeNonce = (cb) => crypto.randomBytes(64, (err, res) => {
  if (!err) {
    cb(err, res.toString('base64'));
  } else {
    cb(err, res);
  }
});

// TODO: this base64 encoding isn't URL-friendly
const nonceToState = (nonce) =>
  crypto.createHash('sha256').update(nonce, 'base64').digest('base64');

const setNonce = (res, name, nonce) =>
  res.setHeader('set-cookie',
                cookie.serialize(nonceCookie(name), nonce,
                                 {maxAge: 3600, secure: true, httpOnly: true}));

const clearNonce = (res, name) =>
  res.setHeader('set-cookie',
                cookie.serialize(nonceCookie(name), 'invalid',
                                 {maxAge: -1, secure: true, httpOnly: true}));

const getNonce = (req, name) => {
  const field = nonceCookie(name);
  if (req.headers.cookie) {
    const value = cookie.parse(req.headers.cookie);
    return value[field];
  }
};

const optionsSchema = Joi.object({
  horizon: Joi.object().required(),
  provider: Joi.string().required(),
  // makeAcquireUrl takes `state` and `returnUrl`, returns a string url
  makeAcquireUrl: Joi.func().arity(2).required(),
  // makeTokenRequest takes `code` and `returnUrl`, returns an http request
  makeTokenRequest: Joi.func().arity(2).required(),
  // makeInspectRequest takes `accessToken`, returns an http request
  makeInspectRequest: Joi.func().arity(1).required(),
  // extractId takes `userInfo`, returns a unique value for the user from the provider
  extractId: Joi.func().arity(1).required(),
}).unknown(false);

// Attaches an endpoint to the horizon server, providing an oauth2 redirect flow
const oauth2 = (context, rawOptions) => {
  const options = Joi.attempt(rawOptions, optionsSchema);

  const provider = options.provider;
  const makeAcquireUrl = options.makeAcquireUrl;
  const makeTokenRequest = options.makeTokenRequest;
  const makeInspectRequest = options.makeInspectRequest;
  const extractId = options.extractId;

  const selfUrl = (host, path) =>
    url.format({protocol: 'https', host: host, pathname: path});

  const makeSuccessUrl = (horizonToken) =>
    url.format(extendUrlQuery(context.horizon.auth.successUrl, {horizonToken}));

  const makeFailureUrl = (horizonError) =>
    url.format(extendUrlQuery(context.horizon.auth.failureUrl, {horizonError}));

  horizon.add_http_handler(provider, (req, res) => {
    const requestUrl = url.parse(req.url, true);
    const returnUrl = selfUrl(req.headers.host, requestUrl.pathname);
    const code = requestUrl.query && requestUrl.query.code;
    const error = requestUrl.query && requestUrl.query.error;

    horizon.events.emit('log', 'debug', `oauth request: ${JSON.stringify(requestUrl)}`);
    if (error) {
      const description = requestUrl.query.error_description || error;
      doRedirect(res, makeFailureUrl(description));
    } else if (!code) {
      // We need to redirect to the API to acquire a token, then come back and try again
      // Generate a nonce to track this client session to prevent CSRF attacks
      makeNonce((nonceErr, nonce) => {
        if (nonceErr) {
          horizon.events.emit('log', 'error', `Error creating nonce for oauth state: ${nonceErr}`);
          res.statusCode = 503;
          res.end('error generating nonce');
        } else {
          setNonce(res, horizon._name, nonce);
          doRedirect(res, makeAcquireUrl(nonceToState(nonce), returnUrl));
        }
      });
    } else {
      // Make sure this is the same client who obtained the code to prevent CSRF attacks
      const nonce = getNonce(req, horizon._name);
      const state = requestUrl.query.state;

      if (!nonce || !state || state !== nonceToState(nonce)) {
        doRedirect(res, makeFailureUrl('session expired'));
      } else {
        // We have the user code, turn it into an access token
        runRequest(makeTokenRequest(code, returnUrl), (err1, body) => {
          const info = tryJsonParse(body);
          const accessToken = info && info.accessToken;

          if (err1) {
            horizon.events.emit('log', 'error', `Error contacting oauth API: ${err1}`);
            res.statusCode = 503;
            res.end('oauth provider error');
          } else if (!accessToken) {
            horizon.events.emit('log', 'error', `Bad JSON data from oauth API: ${body}`);
            res.statusCode = 500;
            res.end('unparseable token response');
          } else {
            // We have the user access token, get info on it so we can find the user
            runRequest(makeInspectRequest(accessToken), (err2, innerBody) => {
              const userInfo = tryJsonParse(innerBody);
              const userId = userInfo && extractId(userInfo);

              if (err2) {
                horizon.events.emit('log', 'error', `Error contacting oauth API: ${err2}`);
                res.statusCode = 503;
                res.end('oauth provider error');
              } else if (!userId) {
                horizon.events.emit('log', 'error', `Bad JSON data from oauth API: ${innerBody}`);
                res.statusCode = 500;
                res.end('unparseable inspect response');
              } else {
                horizon._auth.generate(provider, userId).nodeify((err3, jwt) => {
                  // Clear the nonce just so we aren't polluting clients' cookies
                  clearNonce(res, horizon._name);
                  doRedirect(res, err3 ?
                    makeFailureUrl('invalid user') :
                    makeSuccessUrl(jwt.token));
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
  doRedirect, runRequest,
  makeNonce, setNonce, getNonce, clearNonce, nonceToState,
  extendUrlQuery,
  tryJsonParse,
};
