#!/usr/bin/env node
'use strict'

const express = require('express');
const horizon = require('@horizon/server');

const app = express();
const http_server = app.listen(8181);
const options = { auth: { token_secret: 'my_super_secret_secret' } };
const horizon_server = horizon(http_server, options);

console.log('Listening on port 8181.');
