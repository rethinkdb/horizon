#!/usr/bin/env node
'use strict';

const fusion = require('../');

const argparse = require('argparse');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const parser = new argparse.ArgumentParser({
  addHelp: true,
  description: 'Fusion Server',
});

parser.addArgument([ '--bind', '-b' ], {
  type: 'string',
  action: 'append',
  metavar: 'HOST',
  help: 'Local hostname to serve fusion on (repeatable).',
});

parser.addArgument([ '--port', '-p' ], {
  type: 'int',
  defaultValue: 8181,
  metavar: 'PORT',
  help: 'Local port to serve fusion on.',
});

parser.addArgument([ '--connect', '-c' ], {
  type: 'string',
  metavar: 'HOST:PORT',
  help: 'Host and port of the RethinkDB server to connect to.',
});

parser.addArgument([ '--key-file' ], {
  type: 'string',
  metavar: 'PATH',
  help: 'Path to the key file to use, defaults to "./key.pem".',
});

parser.addArgument([ '--cert-file' ], {
  type: 'string',
  metavar: 'PATH',
  help: 'Path to the cert file to use, defaults to "./cert.pem".',
});
parser.addArgument([ '--debug' ], {
  action: 'storeTrue',
  help: 'Enable debug logging.',
});

parser.addArgument([ '--insecure' ], {
  action: 'storeTrue',
  help: 'Serve insecure websockets, ignore --key-file and --cert-file.',
});

parser.addArgument([ '--auto-create-table' ], {
  action: 'storeTrue',
  help: 'Create tables used by requests if they do not exist.',
});

parser.addArgument([ '--auto-create-index' ], {
  action: 'storeTrue',
  help: 'Create indexes used by requests if they do not exist.',
});

parser.addArgument([ '--dev' ], {
  action: 'storeTrue',
  help: 'Runs the server in development mode, this sets --debug, --insecure, --auto-create-tables, and --auto-create-indexes.',
});

parser.addArgument([ '--config' ], {
  type: 'string',
  metavar: 'PATH',
  help: 'Sets server configuration using the config file at the specified path',
});

const parsed = parser.parseArgs();
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

// If config file path given, check if valid file/path. Since
//  `require` is being used here. Looking before leaping here,
//  rather than using fs.open and reporting back error.
//  Then apply config file settings to running config.
if (parsed.config) {
  // First check if permissions allow us to read file.
  try {
    fs.accessSync(parsed.config, fs.R_OK);
  } catch (err) {
    fusion.logger.error('Unable to access file, check file permissions.');
    fusion.logger.error(err);
    process.exit(1);
  }

  // Check if file is actually a file.
  try {
    const stat = fs.statSync(parsed.config);
    if (!stat.isFile()) {
      fusion.logger.error('Config path is not a file.');
      process.exit(1);
    }
  } catch (err) {
    fusion.logger.error('Error occurred while retrieving config file stats.');
    fusion.logger.error(err);
    process.exit(1);
  }

  // Read and import file, flags receive precedence over
  //  config file settings.
  let file_config;
  if (parsed.config.endsWith('.js')) {
    file_config = require(path.resolve(parsed.config.slice(0, -3)));
  } else {
    file_config = require(parsed.config);
  }

  // Push all config file properties onto parsed ones.
  config = Object.assign(config, file_config);
}

// Gather environment variables
const envVars = {};
for (let prop in process.env) {
  if (prop.startsWith('FUSION_')) {
    try {
      const varName = prop.toLowerCase().split('_')[1];
      envVars[varName] = process.env[prop];
    } catch(err) {
      fusion.logger.error('Error occurred while parsing env variables.\n', err);
      process.exit(1);
    }
  }
}

// Apply environment variables on top of command line flags.
config = Object.assign(config, envVars);

// Lastly, merge command line flags to running config settings
for (var prop in parsed) {

  // Ensure isn't some inherited property non-sense and !null
  if (parsed.hasOwnProperty(prop) && parsed[prop]) {
    config[prop] = parsed[prop];
  }
}

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
