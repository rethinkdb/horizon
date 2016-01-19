#!/usr/bin/env node --harmony-destructuring
'use strict'

const utils = require('../server/test/utils');
const fusion = require('../server');

// We could make this a module, but we already require the server to be configured,
// so reuse its argparse module
const argparse = require('../server/node_modules/argparse');

const assert = require('assert');
const child_process = require('child_process');
const dns = require('dns');
const fs = require('fs');
const http = require('http');
const path = require('path');
const url = require('url');
const process = require('process');

const parser = new argparse.ArgumentParser();
parser.addArgument([ '--port', '-p' ],
  { type: 'int', defaultValue: 8181, metavar: 'PORT',
    help: 'Local port to serve HTTP assets and fusion on.' });

parser.addArgument([ '--bind', '-b' ],
  { type: 'string', defaultValue: [ 'localhost' ], action: 'append', metavar: 'HOST',
    help: 'Local hostname(s) to serve HTTP and fusion on (repeatable).' });

parser.addArgument([ '--keep', '-k' ],
  { defaultValue: false, action: 'storeTrue',
    help: 'Keep the existing "rethinkdb_data_test" directory.' });

const options = parser.parseArgs();

if (options.bind.indexOf('all') !== -1) { options.bind = [ '0.0.0.0' ]; }

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

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
const build_proc = child_process.fork('../client/build.js',
                                      [ 'build', '--watch' ],
                                      { cwd: '../client/', silent: true });

build_proc.on('exit', () => process.exit(1));
process.on('exit', () => build_proc.kill('SIGTERM'));

let client_ready = false;
utils.each_line_in_pipe(build_proc.stdout, (line) => {
  if (line.indexOf('bytes written') !== -1) {
      client_ready = true;
      const date = new Date();
      console.log(`${date.toLocaleTimeString()} - fusion.js rebuilt.`);
  }
});

// Launch HTTP server with fusion that will serve the test files
const http_servers = options.bind.map((host) =>
  new http.Server((req, res) => {
    const req_path = url.parse(req.url).pathname;
    serve_file(path.resolve('../client' + req_path), res);
  }));

// Determine the local IP addresses to tell `rethinkdb` to bind on
new Promise((resolve) => {
  let outstanding = options.bind.length;
  const res = new Set();
  const add_results = (err, addrs) => {
    assert.ifError(err);
    addrs.forEach((addr) => {
      // Filter out link-local addresses since node doesn't tell us the scope-id
      if (addr.address.indexOf('fe80') !== 0) { res.add(addr.address); }
    });
    outstanding -= 1;
    if (outstanding === 0) { resolve(res); }
  };

  options.bind.forEach((host) => {
    dns.lookup(host, { all: true }, add_results);
  });
}).then((local_addresses) => {
  // Launch rethinkdb - once we know the port we can attach fusion to the http server
  utils.start_rdb_server({ bind: local_addresses, keep: options.keep }, () => {
    assert.notStrictEqual(utils.rdb_port(), undefined);
    console.log(`RethinkDB server listening for clients on port ${utils.rdb_port()}.`);
    console.log(`RethinkDB server listening for HTTP on port ${utils.rdb_http_port()}.`);

    fusion.logger.level = 'debug';
    const fusion_server = new fusion.Server(http_servers,
                                            { auto_create_table: true,
                                              auto_create_index: true,
                                              rdb_port: utils.rdb_port() });

    // Capture requests to `fusion.js` and `fusion.js.map` before the fusion server
    http_servers.forEach((serv, i) => {
      const extant_listeners = serv.listeners('request').slice(0);
      serv.removeAllListeners('request');
      serv.on('request', (req, res) => {
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
          extant_listeners.forEach((l) => l.call(serv, req, res));
        }
      });

      serv.listen(options.port, options.bind[i],
        () => console.log(`HTTP server listening on ${options.bind[i]}:${options.port}.`));
    });
  });
});
