'use strict';

const joi = require('joi');

// Issue a dummy joi validation to force joi to initialize its scripts.
// This is used because tests will mock the filesystem, and the lazy
// `require`s done by joi will no longer work at that point.
joi.validate('', joi.any().when('', { is: '', then: joi.any() }));

const server = require('./server');

const create_server = (http_servers, options) =>
  new server.Server(http_servers, options);

module.exports = create_server;
module.exports.Server = server.Server;

module.exports.r = require('rethinkdb');
module.exports.logger = require('./logger');
module.exports.utils = require('./utils');

module.exports.auth = {
  auth0: require('./auth/auth0'),
  facebook: require('./auth/facebook'),
  github: require('./auth/github'),
  google: require('./auth/google'),
  slack: require('./auth/slack'),
  twitch: require('./auth/twitch'),
  twitter: require('./auth/twitter'),
};
