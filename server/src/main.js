'use strict';

const fusion = require('./server');

const argparse = require('argparse');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

const parser = new argparse.ArgumentParser();
parser.addArgument([ '--bind', '-b' ],
  { type: 'string', action: 'append', metavar: 'HOST',
    help: 'Local hostname to serve fusion on (repeatable).' });

parser.addArgument([ '--port', '-p' ],
  { type: 'int', defaultValue: 8181, metavar: 'PORT',
    help: 'Local port to serve fusion on.' });

parser.addArgument([ '--connect', '-c' ],
  { type: 'string', metavar: 'HOST:PORT',
    help: 'Host and port of the RethinkDB server to connect to.' });

parser.addArgument([ '--key-file' ],
  { type: 'string', defaultValue: './key.pem', metavar: 'PATH',
    help: 'Path to the key file to use, defaults to "./key.pem".' });

parser.addArgument([ '--cert-file' ],
  { type: 'string', defaultValue: './cert.pem', metavar: 'PATH',
    help: 'Path to the cert file to use, defaults to "./cert.pem".' });

parser.addArgument([ '--debug' ],
  { defaultValue: false, action: 'storeTrue',
    help: 'Enable debug logging.' });

parser.addArgument([ '--unsecure' ],
  { defaultValue: false, action: 'storeTrue',
    help: 'Serve unsecure websockets, ignore --key-file and --cert-file.' });

parser.addArgument([ '--dev' ],
  { defaultValue: false, action: 'storeTrue',
    help: 'Runs the server in development mode - automatic creation of indexes and tables.' });

const parsed = parser.parseArgs();
const options = { };

if (parsed.connect !== null) {
  const host_port = parsed.connect.split(':');
  if (host_port.length === 1) {
    options.rdb_host = host_port[0];
  } else if (host_port.length === 2) {
    options.rdb_host = host_port[0];
    options.rdb_port = host_port[1];
  } else {
    console.log(`Expected --connect HOST:PORT, but found "${parsed.connect}"`);
    parsed.printUsage();
    process.exit(1);
  }
}

const serveFile = (file_path, res) => {
  fs.access(file_path, fs.R_OK | fs.F_OK, (exists) => {
    if (exists) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end(`Client library not found\n`);
    } else {
      fs.readFile(file_path, 'binary', (err, file) => {
        if (err) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end(`${err}\n`);
        } else {
          res.writeHead(200);
          res.end(file, 'binary');
        }
      });
    }
  });
};

// Function which handles just the /fusion.js endpoint
const handle_http = (req, res) => {
  const req_path = url.parse(req.url).pathname;
  fusion.logger.debug(`HTTP request for "${req_path}"`);

  if (req_path === '/fusion.js') {
    const file_path = path.resolve('../client/dist/fusion.js');
    serveFile(file_path, res);
  } else if (req_path === '/fusion.js.map') {
    const file_path = path.resolve('../client/dist/fusion.js.map');
    serveFile(file_path, res);
  } else {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end(`Forbidden\n`);
  }
};

const param_if_not_null = (param) => { if (param !== null) { return param; } };

const local_port = param_if_not_null(parsed.port);
const local_hosts = param_if_not_null(parsed.bind) || [ 'localhost' ];
const http_servers = new Set();
if (parsed.unsecure) {
  fusion.logger.warn(`Creating unsecure HTTP server.`);
  local_hosts.forEach((host) => {
    http_servers.add(new http.Server(handle_http).listen(local_port, host));
  });
} else {
  let key = fs.readFileSync(parsed.key_file || './key.pem');
  let cert = fs.readFileSync(parsed.cert_file || './cert.pem');

  local_hosts.forEach((host) => {
    http_servers.add(new https.Server({ key, cert }, handle_http).listen(local_port, host));
  });
}

if (parsed.debug) {
  fusion.logger.level = 'debug';
}

options.dev_mode = Boolean(parsed.dev);

// Wait for the http servers to be ready before launching the Fusion server
let num_ready = 0;
let fusion_server;
http_servers.forEach((serv) => {
  serv.on('listening', () => {
    fusion.logger.info(`Listening on ${serv.address().address}:${serv.address().port}.`);
    if (++num_ready == http_servers.size) {
      fusion_server = new fusion.Server(http_servers, options);
    }
  });
  serv.on('error', (err) => {
    fusion.logger.error(`HTTP${parsed.unsecure ? '' : 'S'} server: ${err}`);
    process.exit(1);
  });
});
