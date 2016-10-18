#!/usr/bin/env node
'use strict'

const HorizonRouter = require('@horizon/http-router');
const horizonDefaultPlugins = require('@horizon-plugins/defaults');

const http = require('http');

const httpServer = http.createServer();
httpServer.listen(8181);
console.log('Listening on port 8181.');

const hzRouter = new HorizonRouter(httpServer, {auth: {tokenSecret: 'hunter2'}});
httpServer.on('request', hzRouter.handler());

hzRouter.add(horizonDefaultPlugins).then(() => {
  console.log('Horizon server ready.');
});
