'use strict';

const server = require('./server');
const logger = require('./logger');

const create_server = (http_servers, options) => {
  return new server.Server(http_servers, options);
};

module.exports = create_server;
module.exports.logger = logger;
module.exports.Server = server.Server;
