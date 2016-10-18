'use strict';

const joi = require('joi');

// Issue a dummy joi validation to force joi to initialize its scripts.
// This is used because tests will mock the filesystem, and the lazy
// `require`s done by joi will no longer work at that point.
joi.validate('', joi.any().when('', {is: '', then: joi.any()}));

const server = require('./server');

function createServer(httpServers, options) {
  return new server.Server(httpServers, options);
}

module.exports = createServer;
module.exports.Server = server.Server;

const reliable = require('./reliable');
module.exports.Reliable = reliable.Reliable;
module.exports.ReliableConn = reliable.ReliableConn;
module.exports.ReliableUnion = reliable.ReliableUnion;
module.exports.ReliableChangefeed = reliable.ReliableChangefeed;
