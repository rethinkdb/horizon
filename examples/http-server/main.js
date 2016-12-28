#!/usr/bin/env node
'use strict'

const http = require('http');
const HorizonRouter = require('@horizon/http-router');
const horizonDefaultPlugins = require('@horizon-plugins/defaults');

const httpServer = http.createServer();
httpServer.listen(8181, () => {
  console.log('Listening on port 8181.');
});

const horizonOptions = {
  auth: {
    tokenSecret: 'hunter2',
  },
};

const hzRouter = new HorizonRouter(httpServer, horizonOptions);
hzRouter.events.on('log', (level, msg) => console.log(`${level}: ${msg}`));

const pluginOptions = {
  autoCreateCollection: true,
  autoCreateIndex: true,
};

hzRouter.add(horizonDefaultPlugins, pluginOptions).then(() => {
  console.log('Horizon server ready.');
});

httpServer.on('request', hzRouter.handler());
