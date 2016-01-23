#!/usr/bin/env node
'use strict'

const express = require('express')();
const fusion = require('fusion-server');

const app = express();
const http_server = app.listen(8181);
const fusion_server = fusion(http_server);

console.log('Listening on port 8181.');
