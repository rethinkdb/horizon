'use strict';

const fusion = require('./server.js');
const fs     = require('fs');
const path   = require('path');
const nopt   = require('nopt');

var parsed = new nopt({ bind: [String, Array], port: Number, connect: String, unsecure: Boolean, key_file: path, cert_file: path, debug: Boolean });
var print_usage = function () {
  console.log('Usage: node fusion.js [OPTIONS]');
  console.log('');
  console.log('  --bind HOST            local hostname to serve fusion on (repeatable)');
  console.log('  --port PORT            local port to serve fusion on');
  console.log('  --connect HOST:PORT    host and port of the RethinkDB server to connect to');
  console.log('  --unsecure             serve unsecure websockets, ignore --key-file and --cert-file');
  console.log('  --key-file PATH        path to the key file to use, defaults to ./key.pem');
  console.log('  --cert-file PATH       path to the cert file to use, defaults to ./cert.pem');
  console.log('  --debug                enable debug logging');
  console.log('');
};

if (parsed.help) {
  print_usage();
  process.exit(0);
} else if (parsed.argv.remain.length !== 0) {
  // TODO: nopt doesn't let us discover extra '--flag' options - choose a new library
  console.log(`Unrecognized argument: ${parsed.argv.remain[0]}`);
  print_usage();
  process.exit(0);
}

var opts = { };

if (parsed.bind !== undefined) {
  opts.local_hosts = new Set(['localhost']);
  parsed.bind.forEach((item) => opts.local_hosts.add(item));
}

if (parsed.port !== undefined) {
  opts.local_port = parsed.port;
}

if (parsed.connect !== undefined) {
  var host_port = parsed.connect.split(':');
  if (host_port.length === 1) {
    opts.rdb_host = host_port[0];
  } else if (host_port.length === 2) {
    opts.rdb_host = host_port[0];
    opts.rdb_port = host_port[1];
  } else {
    console.log(`Expected --connect HOST:PORT, but found "${parsed.connect}"`);
    print_usage();
    process.exit(1);
  }
}

if (parsed.debug) {
  fusion.logger.level = 'debug';
}

if (!parsed.unsecure) {
  if (parsed.key_file !== undefined) {
    opts.key = fs.readFileSync(key_file);
  } else {
    opts.key = fs.readFileSync('./key.pem');
  }

  if (parsed.cert_file !== undefined) {
    opts.cert = fs.readFileSync(parsed.cert_file);
  } else {
    opts.cert = fs.readFileSync('./cert.pem');
  }

  new fusion.Server(opts);
} else {
  new fusion.UnsecureServer(opts);
}
