#!/usr/bin/env node
'use strict'

const express = require('express');
const horizon = require('@horizon/server');

const app = express();

app.use(express.static('./dist'));

const http_server = app.listen(8181);
const options = {
  project_name: 'example_app',
  auth: {
    token_secret: 'my_super_secret_secret',
    // make sure that the following is set to true, otherwise
    // horizon client wont be able to connect using default constructor
    allow_unauthenticated: true,
  },
};
const horizon_server = horizon(http_server, options);

console.log('Listening on port 8181.');
