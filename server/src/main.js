'use strict';

const fusion = require('./server');

const fs = require('fs');
const argparse = require('argparse');

const parser = new argparse.ArgumentParser();
parser.addArgument([ '--bind', '-b' ],
  { type: 'string', action: 'append', metavar: 'HOST',
    help: 'Local hostname to serve fusion on (repeatable).' });

parser.addArgument([ '--port', '-p' ],
  { type: 'int', metavar: 'PORT',
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

const parsed = parser.parseArgs();
const options = { };

const param_if_not_null = (param) => { if (param !== null) { return param; } };

options.local_port = param_if_not_null(parsed.port);
options.local_hosts = param_if_not_null(parsed.bind);

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

if (parsed.debug) {
  fusion.logger.level = 'debug';
}

if (!parsed.unsecure) {
  if (parsed.key_file !== null) {
    options.key = fs.readFileSync(parsed.key_file);
  } else {
    options.key = fs.readFileSync('./key.pem');
  }

  if (parsed.cert_file !== null) {
    options.cert = fs.readFileSync(parsed.cert_file);
  } else {
    options.cert = fs.readFileSync('./cert.pem');
  }

  new fusion.Server(options);
} else {
  new fusion.UnsecureServer(options);
}
