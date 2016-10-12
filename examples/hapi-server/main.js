#!/usr/bin/env node
'use strict'

const Hapi = require('hapi');
const horizonRouter = require('@horizon/hapi-router');
const horizonDefaultPlugins = require('@horizon-plugins/defaults');

const server = new Hapi.Server();
server.connection({port: 8181});
server.start(() => {
  console.log('Listening on port 8181.');
});

const httpServers = server.connections.map((c) => c.listener);

const hzRouter = horizonRouter(httpServers, {auth: {token_secret: 'hunter2'}});
hzRouter.add(horizonDefaultPlugins).then(() => {
  console.log('Horizon server ready.');
});

server.route({
  method: '*',
  path: '/horizon/{p*}',
  handler: hzRouter.handler(),
});
