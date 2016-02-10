#!/usr/bin/env node
'use strict';

const fusion = require('../');

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const cli = require('cli');

// Get parser from cli helper
const parser = cli.cli_parser();

// Parse given argument
const parsed = parser.parseArgs();

// Init empty configs
let config = {};
const options = {};

const defaults = {
  auto_create_index: false,
  auto_create_table: false,
  cert_file: './cert.pem',
  connect: 'localhost:28015',
  debug: false,
  dev: false,
  insecure: false,
  key_file: './key.pem',
  port: 8181,
};

// Apply defaults first.
config = Object.assign(config, defaults);

// Apply config read from given config file if
//  it exists.
config = cli.read_from_config_file(config, parsed);

// Gather environment variables and apply
//  them to config if present.
config = cli.read_from_env_vars(config);

// Lastly, merge command line flags in to running config
//  settings
config = cli.read_from_flags(config, parsed);

// Set proper flags for dev mode.
if (config.dev) {
  config.debug = true;
  config.insecure = true;
  config.auto_create_table = true;
  config.auto_create_index = true;
}

if (config.connect !== null) {
  const host_port = config.connect.split(':');
  if (host_port.length === 1) {
    options.rdb_host = host_port[0];
  } else if (host_port.length === 2) {
    options.rdb_host = host_port[0];
    options.rdb_port = host_port[1];
  } else {
    console.log(`Expected --connect HOST:PORT, but found "${config.connect}"`);
    config.printUsage();
    process.exit(1);
  }
}

const param_if_not_null = (param) => { if (param !== null) { return param; } };

const local_port = param_if_not_null(config.port);
const local_hosts = param_if_not_null(config.bind) || [ 'localhost' ];
const http_servers = new Set();

if (local_hosts.indexOf('all') !== -1) {
  local_hosts.length = 0;
  local_hosts.push('0.0.0.0');
}

if (config.insecure) {
  fusion.logger.warn(`Creating insecure HTTP server.`);
  local_hosts.forEach((host) => {
    http_servers.add(new http.Server().listen(local_port, host));
  });
} else {
  const read_file = (file) => {
    try {
      return fs.readFileSync(path.resolve(file));
    } catch (err) {
      console.log(`Could not access file ${file} for running a secure HTTP server.`);
      process.exit(1);
    }
  };

  const key = read_file(config.key_file);
  const cert = read_file(config.cert_file);

  local_hosts.forEach((host) => {
    http_servers.add(new https.Server({ key, cert }).listen(local_port, host));
  });
}

if (config.debug) {
  fusion.logger.level = 'debug';
}

options.auto_create_table = Boolean(config.auto_create_table);
options.auto_create_index = Boolean(config.auto_create_index);

// Wait for the http servers to be ready before launching the Fusion server
let num_ready = 0;
http_servers.forEach((serv) => {
  serv.on('request', (req, res) => {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('File not found.');
  });

  serv.on('listening', () => {
    fusion.logger.info(`Listening on ${serv.address().address}:${serv.address().port}.`);
    if (++num_ready === http_servers.size) {
      new fusion.Server(http_servers, options);
    }
  });

  serv.on('error', (err) => {
    fusion.logger.error(`HTTP${config.insecure ? '' : 'S'} server: ${err}`);
    process.exit(1);
  });
});
