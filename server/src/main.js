#!/usr/bin/env node --harmony-destructuring
'use strict';

const fusion = require('./fusion');

const argparse = require('argparse');
const http = require('http');
const https = require('https');
const fs = require('fs');

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

parser.addArgument([ '--auto-create-table' ],
  { defaultValue: false, action: 'storeTrue',
    help: 'Create tables used by requests if they do not exist.' });

parser.addArgument([ '--auto-create-index' ],
  { defaultValue: false, action: 'storeTrue',
    help: 'Create indexes used by requests if they do not exist.' });

parser.addArgument([ '--dev' ],
  { defaultValue: false, action: 'storeTrue',
    help: 'Runs the server in development mode, this sets --debug, --unsecure, --auto-create-tables, and --auto-create-indexes.' });

const parsed = parser.parseArgs();
const options = { };

if (parsed.dev) {
  parsed.debug = true;
  parsed.unsecure = true;
  parsed.auto_create_table = true;
  parsed.auto_create_index = true;
}

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

const param_if_not_null = (param) => { if (param !== null) { return param; } };

const local_port = param_if_not_null(parsed.port);
const local_hosts = param_if_not_null(parsed.bind) || [ 'localhost' ];
const http_servers = new Set();

if (local_hosts.indexOf('all') !== -1) {
  local_hosts.length = 0;
  local_hosts.push('0.0.0.0');
}

if (parsed.unsecure) {
  fusion.logger.warn(`Creating unsecure HTTP server.`);
  local_hosts.forEach((host) => {
    http_servers.add(new http.Server().listen(local_port, host));
  });
} else {
  let key = fs.readFileSync(parsed.key_file || './key.pem');
  let cert = fs.readFileSync(parsed.cert_file || './cert.pem');

  local_hosts.forEach((host) => {
    http_servers.add(new https.Server({ key, cert }).listen(local_port, host));
  });
}

if (parsed.debug) {
  fusion.logger.level = 'debug';
}

options.auto_create_table = Boolean(parsed.auto_create_table);
options.auto_create_index = Boolean(parsed.auto_create_index);

// Wait for the http servers to be ready before launching the Fusion server
let num_ready = 0;
http_servers.forEach((serv) => {
  serv.on('request', (req, res) => {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('File not found.');
  });

  serv.on('upgrade', (req, res) => {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Upgrade not defined at this endpoint.');
  });

  serv.on('listening', () => {
    fusion.logger.info(`Listening on ${serv.address().address}:${serv.address().port}.`);
    if (++num_ready === http_servers.size) {
      new fusion.Server(http_servers, options);
    }
  });

  serv.on('error', (err) => {
    fusion.logger.error(`HTTP${parsed.unsecure ? '' : 'S'} server: ${err}`);
    process.exit(1);
  });
});
