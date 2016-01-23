#!/usr/bin/env node
'use strict'

const Hapi = require('hapi');
const fusion = require('fusion-server');

const server = new Hapi.Server();
server.connection({ port: 8181 });

const http_servers = server.connections.map((c) => c.listener);
const fusion_server = fusion(http_servers);

server.start(() => {
  console.log(`Listening on port 8181.`);
});
