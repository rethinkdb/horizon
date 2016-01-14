#!/usr/bin/env node --harmony-destructuring
'use strict'

const server_test_utils = require('../server/test/utils');
const fusion = require('../server');

const assert = require('assert');
const child_process = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');
const url = require('url');

let client_ready = false;

const serve_file = (file_path, res) => {
  fs.access(file_path, fs.R_OK | fs.F_OK, (exists) => {
    if (exists) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end(`File "${file_path}" not found\n`);
    } else {
      fs.readFile(file_path, 'binary', (err, file) => {
        if (err) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end(`${err}\n`);
        } else {
          if (file_path.endsWith('.js')) {
            res.writeHead(200, { 'Content-Type': 'application/javascript' });
          } else if (file_path.endsWith('.html')) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
          } else {
              res.writeHead(200);
          }
          res.end(file, 'binary');
        }
      });
    }
  });
};

// TODO: add options for keeping the rethinkdb data dir or changing the logging level or port

// Run the client build
const build_proc = child_process.fork('../client/build.js', [ 'build' ], { cwd: '../client/' });
build_proc.on('exit', (res) => {
  assert.strictEqual(res, 0);
  client_ready = true;
});

// Launch HTTP server with fusion that will serve the test files
const http_server = new http.Server((req, res) => {
  const req_path = url.parse(req.url).pathname;
  serve_file(path.resolve('../client' + req_path), res);
});


// Launch rethinkdb - once we know the port we can attach fusion to the http server
server_test_utils.start_rdb_server(() => {
  assert.notStrictEqual(server_test_utils.rdb_port(), undefined);
  console.log(`RethinkDB server listening on port ${server_test_utils.rdb_port()}.`);

  fusion.logger.level = 'debug';
  const fusion_server = new fusion.Server(http_server,
                                          { auto_create_table: true,
                                            auto_create_index: true,
                                            rdb_port: server_test_utils.rdb_port() });

  // Capture requests to `fusion.js` and `fusion.js.map` before the fusion server
  const extant_listeners = http_server.listeners('request').slice(0);
  http_server.removeAllListeners('request');
  http_server.on('request', (req, res) => {
    const req_path = url.parse(req.url).pathname;
    if (req_path.indexOf('/fusion/fusion.js') === 0 ||
        req_path.indexOf('/fusion/fusion.js.map') === 0) {
      if (!client_ready) {
        res.writeHead(503, { 'Content-Type': 'text/plain' });
        res.end('Client build is ongoing, try again in a few seconds.');
      } else {
        serve_file(path.resolve(req_path.replace('/fusion', '../client/dist')), res);
      }
    } else {
      extant_listeners.forEach((l) => l.call(http_server, req, res));
    }
  });

  http_server.listen(8181, () => console.log('HTTP server listening on port 8181.'));
});

