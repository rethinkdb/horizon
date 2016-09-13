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

module.exports.r = require('rethinkdb');
module.exports.logger = require('./logger');
module.exports.protocol = server.protocol;

const reliable = require('./reliable');
module.exports.Reliable = reliable.Reliable;
module.exports.ReliableConn = reliable.ReliableConn;
module.exports.ReliableUnion = reliable.ReliableUnion;
module.exports.ReliableChangefeed = reliable.ReliableChangefeed;

const fs = require('fs');
const clientSourcePath = require.resolve('@horizon/client/dist/horizon');
const clientSourceCorePath = require.resolve('@horizon/client/dist/horizon-core');

let clientSource, clientSourceMap, clientSourceCore, clientSourceCoreMap;

// Load these lazily (but synchronously)
module.exports.clientSource = function() {
  if (!clientSource) {
    clientSource = fs.readFileSync(clientSourcePath);
  }
  return clientSource;
};

module.exports.clientSourceMap = function() {
  if (!clientSourceMap) {
    clientSourceMap = fs.readFileSync(`${clientSourcePath}.map`);
  }
  return clientSourceMap;
};

module.exports.clientSourceCore = function() {
  if (!clientSourceCore) {
    clientSourceCore = fs.readFileSync(clientSourceCorePath);
  }
  return clientSourceCore;
};

module.exports.clientSourceCoreMap = function() {
  if (!clientSourceCoreMap) {
    clientSourceCoreMap = fs.readFileSync(`${clientSourceCorePath}.map`);
  }
  return clientSourceCoreMap;
};

