#!/usr/bin/env node
'use strict'

const express = require('express');
const horizonRouter = require('@horizon/http-router');
const horizonDefaultPlugins = require('@horizon-plugins/defaults');

const httpServer = http.createServer();
httpServer.listen(8181);
console.log('Listening on port 8181.');

const hzRouter = horizonRouter(httpServer, {auth: {token_secret: 'hunter2'}});
httpServer.on('request', hzRouter.handler());

hzRouter.add(horizonDefaultPlugins).then(() => {
  console.log('Horizon server ready.');
});
