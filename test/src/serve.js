#!/usr/bin/env node
'use strict';

Error.stackTraceLimit = Infinity;

const HorizonBaseRouter = require('@horizon/base-router');
const plugins = require('@horizon-plugins/defaults');

// Utilities provided by the CLI library
const each_line_in_pipe = require('horizon/src/utils/each_line_in_pipe');
const start_rdb_server = require('horizon/src/utils/start_rdb_server');
const rm_sync_recursive = require('horizon/src/utils/rm_sync_recursive');
const parse_yes_no_option = require('horizon/src/utils/parse_yes_no_option');

const assert = require('assert');
const child_process = require('child_process');
const dns = require('dns');
const fs = require('fs');
const http = require('http');
const path = require('path');
const url = require('url');
const process = require('process');
const crypto = require('crypto');

const argparse = require('argparse');

const dataDir = path.resolve(__dirname, 'rethinkdb_data_test');
const rootDir = path.resolve(__dirname, '../..');
const clientDistDir = path.resolve(rootDir, 'client/dist');

const parser = new argparse.ArgumentParser();
parser.addArgument(['--port', '-p'],
  {type: 'int', defaultValue: 8181, metavar: 'PORT',
    help: 'Local port to serve HTTP assets and horizon on.'});

parser.addArgument(['--bind', '-b'],
  {type: 'string', defaultValue: ['localhost'], action: 'append', metavar: 'HOST',
    help: 'Local hostname(s) to serve HTTP and horizon on (repeatable).'});

parser.addArgument(['--keep', '-k'],
  {defaultValue: false, action: 'storeTrue',
    help: 'Keep the existing "rethinkdb_data_test" directory.'});

parser.addArgument(['--permissions'],
  {type: 'string', metavar: 'yes|no', constant: 'yes', nargs: '?', defaultValue: 'no',
    help: 'Enable or disable checking permissions on requests, defaults to disabled.'});

const options = parser.parseArgs();

if (options.bind.indexOf('all') !== -1) { options.bind = ['0.0.0.0']; }

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

function readFile(filePath) {
  return new Promise((resolve, reject) =>
    fs.access(filePath, fs.R_OK | fs.F_OK, (exists) => {
      if (exists) {
        reject(new Error(`File "${filePath}" not found.`));
      } else {
        fs.readFile(filePath, 'binary',
          (err, file) => (err ? reject(err) : resolve(file)));
      }
    })
  );
}

function serveFile(filePath, res) {
  readFile(filePath).then((data) => {
    if (filePath.endsWith('.js')) {
      res.writeHead(200, {'Content-Type': 'application/javascript'});
    } else if (filePath.endsWith('.html')) {
      res.writeHead(200, {'Content-Type': 'text/html'});
    } else {
      res.writeHead(200);
    }
    res.end(data, 'binary');
  }).catch((err) => {
    res.writeHead(404, {'Content-Type': 'text/plain'});
    res.end(`${err}\n`);
  });
};

// On Windows, `npm` is actually `npm.cmd`
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

// Run the client build
const buildProc = child_process.spawn(npmCmd, ['run', 'dev'], {cwd: clientDistDir});

buildProc.on('exit', () => process.exit(1));
process.on('exit', () => buildProc.kill('SIGTERM'));

let clientReady = false;
each_line_in_pipe(buildProc.stdout, (line) => {
  console.log(line);
  if (/horizon.js[^.]/.test(line)) {
    setImmediate(() => {
      clientReady = true;
      const date = new Date();
      console.log(`${date.toLocaleTimeString()} - horizon.js rebuilt.`);
    });
  }
});
each_line_in_pipe(buildProc.stderr, (line) => {
  console.error(line);
});

buildProc.stderr.on('data', (data) => {
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
const httpServers = options.bind.map((host) =>
  new http.Server((req, res) => {
    const reqPath = url.parse(req.url).pathname.replace(/^\//, '');
    if (reqPath === 'test' || reqPath === 'test/') {
      res.writeHead(302, {Location: '/client/dist/test.html'});
      res.end();
    } else {
      serveFile(path.resolve(rootDir, reqPath), res);
    }
  }));

// Determine the local IP addresses to tell `rethinkdb` to bind on
Promise.all(
  options.bind.map((host) =>
    new Promise((resolve, reject) =>
      dns.lookup(host, {all: true}, (err, addrs) => {
        if (err) {
          reject(err);
        } else {
          resolve(addrs);
        }
      })))
).then((addrs) =>
  new Set([].concat(...addrs)
    .map((info) => info.address)
    .filter((addr) => !addr.includes('fe80')))
).then((localAddresses) => {
  // Launch rethinkdb - once we know the port we can attach horizon to the http server
  if (!options.keep) {
    rm_sync_recursive(dataDir);
  }

  console.log('starting rethinkdb');
  const rdbServer = start_rdb_server({bind: Array.from(localAddresses), dataDir});
  rdbServer.on('log', (level, msg) => console.log(`RethinkDB ${level}: ${msg}`));
  return rdbServer.ready();
}).then((rdbServer) => {
  assert.notStrictEqual(rdbServer.driverPort, undefined);
  console.log(`RethinkDB server listening for clients on port ${rdbServer.driverPort}.`);
  console.log(`RethinkDB server listening for HTTP on port ${rdbServer.httpPort}.`);
  console.log('starting horizon');

  const hzRouter = new HorizonBaseRouter(httpServers, {
    rdbPort: rdbServer.driverPort,
    projectName: 'hz_test',
    auth: {
      allowUnauthenticated: true,
      allowAnonymous: true,
      tokenSecret: crypto.randomBytes(64).toString('base64'),
    },
  });

  hzRouter.server.events.on('log',
    (level, message) => console.log(`${level}: ${message}`));

  hzRouter.add(plugins, {
    permissions: 'permit-all',
    autoCreateCollection: true,
    autoCreateIndex: true,
  }).catch((err) => {
    console.log(`Plugin initialization failed: ${err.stack}`);
    process.exit(1);
  });

  hzRouter.once('ready', () => {
    // Capture requests to `horizon.js` and `horizon.js.map` before the horizon server
    console.log('plugins ready, adding handlers for HTTP traffic');
    httpServers.forEach((serv, i) => {
      const extantListeners = serv.listeners('request').slice(0);
      serv.removeAllListeners('request');
      serv.on('request', (req, res) => {
        const reqPath = url.parse(req.url).pathname;
        if (reqPath.match(/^\/horizon\/[^\/]+\.js$/)) {
          if (!clientReady) {
            res.writeHead(503, {'Content-Type': 'text/plain'});
            res.end('Initial client build is ongoing, try again in a few seconds.\n');
          } else {
            readFile(path.resolve(clientDistDir, reqPath.replace('/horizon/', ''))).then((data) => {
              res.writeHead(200, {'Content-Type': 'application/javascript'});
              res.end(data + hzRouter.server.applyCapabilitiesCode(), 'binary');
            }).catch((err) => {
              res.writeHead(404, {'Content-Type': 'text/plain'});
              res.end(`${err}\n`);
            });
          }
        } else if (reqPath.match(/^\/horizon\/[^\/]+\.js\.map$/)) {
          serveFile(path.resolve(clientDistDir, reqPath.replace('/horizon/', '')), res);
        } else {
          extantListeners.forEach((l) => l.call(serv, req, res));
        }
      });

      serv.listen(options.port,
                  options.bind[i],
                  () => console.log('HTTP server listening on ' +
                                    `${options.bind[i]}:${options.port}.`));
    });
  });
}).catch((err) => {
  console.log(`Error when starting server:\n${err.stack}`);
  process.exit(1);
});
