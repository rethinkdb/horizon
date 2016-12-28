#!/usr/bin/env node
'use strict'

const Hapi = require('hapi');
const HorizonRouter = require('@horizon/hapi-router');
const horizonDefaultPlugins = require('@horizon-plugins/defaults');

const server = new Hapi.Server();
server.connection({port: 8181});
server.start(() => {
  console.log('Listening on port 8181.');
});

const httpServers = server.connections.map((c) => c.listener);

const hzRouter = new HorizonRouter(httpServers, {auth: {tokenSecret: 'hunter2'}});
hzRouter.events.on('log', (level, msg) => console.log(`${level}: ${msg}`));

hzRouter.add(horizonDefaultPlugins).then(() => {
  console.log('Horizon server ready.');
});

server.route({
  method: '*',
  path: '/horizon/{p*}',
  handler: hzRouter.handler(),
});
