#!/usr/bin/env node
'use strict'

const Hapi = require('hapi');
const horizon = require('horizon-server');

const server = new Hapi.Server();
server.connection({ port: 8181 });

const http_servers = server.connections.map((c) => c.listener);
const horizon_server = horizon(http_servers);

server.start(() => {
  console.log(`Listening on port 8181.`);
});
