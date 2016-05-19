'use strict';

const server = require('./server');
const logger = require('./logger');
const utils = require('./utils');

const create_server = (http_servers, options) =>
  new server.Server(http_servers, options);

module.exports = create_server;
module.exports.logger = logger;
module.exports.utils = utils;
module.exports.Server = server.Server;
module.exports.auth = {
  facebook: require('./auth/facebook'),
  github: require('./auth/github'),
  google: require('./auth/google'),
  slack: require('./auth/slack'),
  twitch: require('./auth/twitch'),
  twitter: require('./auth/twitter'),
};
