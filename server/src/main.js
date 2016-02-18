#!/usr/bin/env node
'use strict';

const horizon = require('../');

const argparse = require('argparse');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const parser = new argparse.ArgumentParser();
parser.addArgument([ '--bind', '-b' ],
  { type: 'string', action: 'append', metavar: 'HOST',
    help: 'Local hostname to serve horizon on (repeatable).' });

parser.addArgument([ '--port', '-p' ],
  { type: 'int', defaultValue: 8181, metavar: 'PORT',
    help: 'Local port to serve horizon on.' });

parser.addArgument([ '--connect', '-c' ],
  { type: 'string', metavar: 'HOST:PORT',
    help: 'Host and port of the RethinkDB server to connect to.' });

parser.addArgument([ '--key-file' ],
  { type: 'string', defaultValue: './horizon-key.pem', metavar: 'PATH',
    help: 'Path to the key file to use, defaults to "./key.pem".' });

parser.addArgument([ '--cert-file' ],
  { type: 'string', defaultValue: './horizon-cert.pem', metavar: 'PATH',
    help: 'Path to the cert file to use, defaults to "./cert.pem".' });

parser.addArgument([ '--debug' ],
  { defaultValue: false, action: 'storeTrue',
    help: 'Enable debug logging.' });

parser.addArgument([ '--insecure' ],
  { defaultValue: false, action: 'storeTrue',
    help: 'Serve insecure websockets, ignore --key-file and --cert-file.' });

parser.addArgument([ '--auto-create-table' ],
  { defaultValue: false, action: 'storeTrue',
    help: 'Create tables used by requests if they do not exist.' });

parser.addArgument([ '--auto-create-index' ],
  { defaultValue: false, action: 'storeTrue',
    help: 'Create indexes used by requests if they do not exist.' });

parser.addArgument([ '--dev' ],
  { defaultValue: false, action: 'storeTrue',
    help: 'Runs the server in development mode, this sets --debug, --insecure, --auto-create-tables, and --auto-create-indexes.' });

const parsed = parser.parseArgs();
const options = { };

if (parsed.dev) {
  parsed.debug = true;
  parsed.insecure = true;
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

if (parsed.insecure) {
  horizon.logger.warn(`Creating insecure HTTP server.`);
  local_hosts.forEach((host) => {
    http_servers.add(new http.Server().listen(local_port, host));
  });
} else {
  const read_file = (file) => {
    try {
      return fs.readFileSync(path.resolve(file));
    } catch (err) {
      console.log(`Could not access file ${file} for running a secure HTTP server: ${err}`);
      process.exit(1);
    }
  };

  const key = read_file(parsed.key_file);
  const cert = read_file(parsed.cert_file);

  local_hosts.forEach((host) => {
    http_servers.add(new https.Server({ key, cert }).listen(local_port, host));
  });
}

if (parsed.debug) {
  horizon.logger.level = 'debug';
}

options.auto_create_table = Boolean(parsed.auto_create_table);
options.auto_create_index = Boolean(parsed.auto_create_index);

// Wait for the http servers to be ready before launching the Horizon server
let num_ready = 0;
http_servers.forEach((serv) => {
  serv.on('request', (req, res) => {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('File not found.');
  });

  serv.on('listening', () => {
    horizon.logger.info(`Listening on ${serv.address().address}:${serv.address().port}.`);
    if (++num_ready === http_servers.size) {
      new horizon.Server(http_servers, options);
    }
  });

  serv.on('error', (err) => {
    horizon.logger.error(`HTTP${parsed.insecure ? '' : 'S'} server: ${err}`);
    process.exit(1);
  });
});
