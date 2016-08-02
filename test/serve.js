#!/usr/bin/env node
'use strict'

Error.stackTraceLimit = Infinity;

const horizon = require('../server');

// Utilities provided by the CLI library
const each_line_in_pipe = require('../cli/src/utils/each_line_in_pipe');
const start_rdb_server = require('../cli/src/utils/start_rdb_server');
const rm_sync_recursive = require('../cli/src/utils/rm_sync_recursive');
const parse_yes_no_option = require('../cli/src/utils/parse_yes_no_option');

// We could make this a module, but we already require the server to be configured,
// so reuse its argparse module
const argparse = require('../cli/node_modules/argparse');

const assert = require('assert');
const child_process = require('child_process');
const dns = require('dns');
const fs = require('fs');
const http = require('http');
const path = require('path');
const url = require('url');
const process = require('process');
const crypto = require('crypto');

const data_dir = path.resolve(__dirname, 'rethinkdb_data_test');
const test_dist_dir = path.resolve(__dirname, '../client/dist');
const examples_dir = path.resolve(__dirname, '../examples');

const parser = new argparse.ArgumentParser();
parser.addArgument([ '--port', '-p' ],
  { type: 'int', defaultValue: 8181, metavar: 'PORT',
    help: 'Local port to serve HTTP assets and horizon on.' });

parser.addArgument([ '--bind', '-b' ],
  { type: 'string', defaultValue: [ 'localhost' ], action: 'append', metavar: 'HOST',
    help: 'Local hostname(s) to serve HTTP and horizon on (repeatable).' });

parser.addArgument([ '--keep', '-k' ],
  { defaultValue: false, action: 'storeTrue',
    help: 'Keep the existing "rethinkdb_data_test" directory.' });

parser.addArgument([ '--permissions' ],
  { type: 'string', metavar: 'yes|no', constant: 'yes', nargs: '?', defaultValue: 'no',
    help: 'Enable or disable checking permissions on requests, defaults to disabled.' });

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

// On Windows, `npm` is actually `npm.cmd`
const npm_cmd = process.platform === "win32" ? "npm.cmd" : "npm";

// Run the client build
const build_proc = child_process.spawn(npm_cmd, [ 'run', 'dev'],
                                      { cwd: test_dist_dir });

build_proc.on('exit', () => process.exit(1));
process.on('exit', () => build_proc.kill('SIGTERM'));

let client_ready = false;
each_line_in_pipe(build_proc.stdout, (line) => {
  console.log(line);
  if (/horizon.js[^.]/.test(line)) {
    setImmediate(() => {
      client_ready = true;
      const date = new Date();
      console.log(`${date.toLocaleTimeString()} - horizon.js rebuilt.`);
    });
  }
});
each_line_in_pipe(build_proc.stderr, (line) => {
  console.error(line);
});

build_proc.stderr.on('data', (data) => {
  const str = data.toString();
  if (str.indexOf('% compile') >= 0) {
    const date = new Date();
    console.log(`${date.toLocaleTimeString()} - client assets compile.`);
  }
  if (str.indexOf('% emit') >= 0) {
    const date = new Date();
    console.log(`${date.toLocaleTimeString()} - client assets emit.`);
  }
});

// Launch HTTP server with horizon that will serve the test files
const http_servers = options.bind.map((host) =>
  new http.Server((req, res) => {
    const req_path = url.parse(req.url).pathname;
    if (req_path.indexOf('/examples/') === 0) {
      serve_file(path.resolve(examples_dir, req_path.replace(/^[/]examples[/]/, '')), res);
    } else {
      if (!client_ready) {
        res.writeHead(503, { 'Content-Type': 'text/plain' });
        res.end('Initial client build is ongoing, try again in a few seconds.');
      } else {
        serve_file(path.resolve(test_dist_dir, req_path.replace(/^[/]/, '')), res);
      }
    }
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
  // Launch rethinkdb - once we know the port we can attach horizon to the http server
  if (!options.keep) {
    rm_sync_recursive(data_dir);
  }

  console.log('starting rethinkdb');

  return start_rdb_server({ bind: local_addresses, dataDir: data_dir });
}).then((server) => {
  assert.notStrictEqual(server.driver_port, undefined);
  console.log(`RethinkDB server listening for clients on port ${server.driver_port}.`);
  console.log(`RethinkDB server listening for HTTP on port ${server.http_port}.`);
  console.log('starting horizon');

  horizon.logger.level = 'debug';
  const horizon_server = new horizon.Server(http_servers, {
    auto_create_collection: true,
    auto_create_index: true,
    rdb_port: server.driver_port,
    permissions: parse_yes_no_option(options.permissions),
    project_name: 'test',
    auth: {
      allow_unauthenticated: true,
      allow_anonymous: true,
      token_secret: crypto.randomBytes(64).toString('base64'),
    },
  });
  console.log('starting http servers');

  // Capture requests to `horizon.js` and `horizon.js.map` before the horizon server
  http_servers.forEach((serv, i) => {
    const extant_listeners = serv.listeners('request').slice(0);
    serv.removeAllListeners('request');
    serv.on('request', (req, res) => {
      const req_path = url.parse(req.url).pathname;
      if (req_path === '/horizon/horizon.js' || req_path === '/horizon/horizon.js.map') {
        serve_file(path.resolve(test_dist_dir, req_path.replace('/horizon/', '')), res);
      } else {
        extant_listeners.forEach((l) => l.call(serv, req, res));
      }
    });

    serv.listen(options.port, options.bind[i],
      () => console.log(`HTTP server listening on ${options.bind[i]}:${options.port}.`));
  });
}).catch((err) => {
  console.log(`Error when starting server:\n${err.stack}`);
  process.exit(1);
});
