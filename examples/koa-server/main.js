#!/usr/bin/env node
'use strict'

const koa = require('koa');
const horizon = require('horizon-server');

const app = koa();
const http_server = app.listen(8181);
const horizon_server = horizon(http_server);

console.log('Listening on port 8181.');
