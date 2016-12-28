#!/usr/bin/env node
'use strict';

const koa = require('koa');
const HorizonRouter = require('@horizon/koa-router');
const horizonDefaultPlugins = require('@horizon-plugins/defaults');

const app = koa();
const httpServer = app.listen(8181, () => {
  console.log('Listening on port 8181.');
});

const hzRouter = new HorizonRouter(httpServer, {auth: {tokenSecret: 'hunter2'}});
hzRouter.events.on('log', (level, msg) => console.log(`${level}: ${msg}`));

hzRouter.add(horizonDefaultPlugins).then(() => {
  console.log('Horizon server ready.');
});

app.use(hzRouter);
