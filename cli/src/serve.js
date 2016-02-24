'use strict';

const horizonServer = require('@horizon/server');
const logger = horizonServer.logger;
const http = require('http');
const https = require('https');
const fs = require('fs');
const url = require('url');
const path = require('path');

const start_rdb_server = require('./utils/start_rdb_server');

const addArguments = (parser) => {
  parser.addArgument([ 'project' ],
    { type: 'string', nargs: '?',
      help: 'Change to this directory before serving' });
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
    { type: 'string', defaultValue: './key.pem', metavar: 'PATH',
      help: 'Path to the key file to use, defaults to "./key.pem".' });

  parser.addArgument([ '--cert-file' ],
    { type: 'string', defaultValue: './cert.pem', metavar: 'PATH',
      help: 'Path to the cert file to use, defaults to "./cert.pem".' });

  parser.addArgument([ '--allow-unauthenticated' ],
    { defaultValue: false, action: 'storeTrue',
      help: 'Whether to allow unauthenticated Horizon connections.' });

  parser.addArgument([ '--debug' ],
    { defaultValue: false, action: 'storeTrue',
      help: 'Enable debug logging.' });

  parser.addArgument([ '--insecure' ],
    { defaultValue: false, action: 'storeTrue',
      help: 'Serve insecure websockets, ignore --key-file and ' +
      '--cert-file.' });

  parser.addArgument([ '--start-rethinkdb' ],
    { defaultValue: false, action: 'storeTrue',
      help: 'Start up a RethinkDB server in the current directory' });

  parser.addArgument([ '--auto-create-table' ],
    { defaultValue: false, action: 'storeTrue',
      help: 'Create tables used by requests if they do not exist.' });

  parser.addArgument([ '--auto-create-index' ],
    { defaultValue: false, action: 'storeTrue',
      help: 'Create indexes used by requests if they do not exist.' });

  parser.addArgument([ '--serve-static' ],
    { type: 'string',
      defaultValue: 'dist',
      nargs: '?',
      metavar: 'PATH',
      help: 'Serve static files from a directory. Defaults to dist' });

  parser.addArgument([ '--dev' ],
    { defaultValue: false, action: 'storeTrue',
      help: 'Runs the server in development mode, this sets ' +
      '--debug, ' +
      '--insecure, ' +
      '--auto-create-tables, ' +
      '--start-rethinkdb, ' +
      '--serve-static, ' +
      'and --auto-create-indexes.' });
};

// Simple file server. 404s if file not found, 500 if file error,
// otherwise serve it with a mime-type suggested by its file extension.
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
            res.writeHead(200, {
              'Content-Type': 'application/javascript' });
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

const fileServer = (distDir) => (req, res) => {
  const req_path = url.parse(req.url).pathname;
  const horizonMatch = req_path.match(/\/horizon\/(horizon\.js(?:\.map)?)$/);
  // Serve client files directly
  if (req_path === '/' || req_path === '') {
    serve_file(path.join(distDir, 'index.html'), res);
  } else if (horizonMatch) {
    const horizonDir = path.dirname(require.resolve('@horizon/client'));
    serve_file(path.join(horizonDir, horizonMatch[1]), res);
  } else if (!req_path.match(/\/horizon\/.*/)) {
    // All other static files come from the dist directory
    serve_file(path.join(distDir, req_path), res);
  }
  // Fall through otherwise. Should be handled by horizon websocket
};

const createInsecureServers = (opts) => {
  logger.warn(`Creating insecure HTTP server.`);
  let http_servers = new Set();
  let numReady = 0;
  return new Promise((resolve) => {
    opts.hosts.forEach((host) => {
      const srv = new http.Server().listen(opts.port, host);
      http_servers.add(srv);
      if (opts.serve_static) {
        logger.info(`Serving static files from ${opts.serve_static}`);
        srv.on('request', fileServer(opts.serve_static));
      }
      srv.on('listening', () => {
        logger.info(`Listening on ${srv.address().address}:` +
                    `${srv.address().port}.`);
        if (++numReady === http_servers.size) {
          resolve(http_servers);
        }
      });
      srv.on('error', (err) => {
        logger.error(
          `HTTP${opts.insecure ? '' : 'S'} server: ${err}`);
        process.exit(1);
      });
    });
  });
};

const readCertFile = (file) => {
  try {
    return fs.readFileSync(path.resolve(file));
  } catch (err) {
    logger.error(`Could not access file ${file} for running ` +
                `a secure HTTP server.`);
    process.exit(1);
  }
};

const createSecureServers = (opts) => {
  let http_servers = new Set();

  const key = readCertFile(opts.key_file);
  const cert = readCertFile(opts.cert_file);
  let numReady = 0;
  return new Promise((resolve) => {
    opts.hosts.forEach((host) => {
      const srv = new https.Server({ key, cert }).listen(opts.port, host);
      http_servers.add(srv);
      if (opts.serve_static) {
        logger.info(`Serving static files from ${opts.serve_static}`);
        srv.on('request', fileServer(opts.serve_static));
      }
      srv.on('listening', () => {
        logger.info(`Listening on ${srv.address().address}:` +
                    `${srv.address().port}.`);
        if (++numReady === http_servers.size) {
          resolve(http_servers);
        }
      });
      srv.on('error', (err) => {
        logger.error(
          `HTTP${opts.insecure ? '' : 'S'} server: ${err}`);
        process.exit(1);
      });
    });
  });
};

// Turns raw argparsed values into the format needed to
// run. Normalizes everything, and bails out if any errors.
const processConfig = (parsed) => {
  // Defaults
  const opts = {
    debug: false,
    project: null,
    auto_create: {
      table: false,
      index: false,
    },
    hosts: [ 'localhost' ],
    port: 8181,
    start_rethinkdb: false,
    serve_static: undefined,
    insecure: false,
    key_file: './key.pem',
    cert_file: './cert.pem',
    rdb: {
      host: 'localhost',
      port: 28015,
    },
  };

  // Dev mode
  if (parsed.dev) {
    opts.debug = true;
    opts.allow_unauthenticated = true;
    opts.insecure = true;
    opts.start_rethinkdb = true;
    opts.auto_create.table = true;
    opts.auto_create.index = true;
    opts.serve_static = 'dist';
  }

  // Sanity check
  if (parsed.start_rethinkdb && parsed.connect) {
    logger.error('Cannot provide both --start-rethinkdb and --connect');
    process.exit(1);
  }

  if (parsed.project != null) {
    opts.project = parsed.project;
  }

  if (parsed.auto_create_table != null) {
    opts.auto_create.table = true;
  }
  if (parsed.auto_create_index != null) {
    opts.auto_create.index = true;
  }

  // Normalize RethinkDB connection options
  if (parsed.connect != null) {
    const host_port = parsed.connect.split(':');
    if (host_port.length === 1) {
      opts.rdb.host = host_port[0];
    } else if (host_port.length === 2) {
      opts.rdb.host = host_port[0];
      opts.rdb.port = host_port[1];
    } else {
      logger.error(`Expected --connect HOST:PORT, but found ` +
                  `"${parsed.connect}"`);
      parsed.printUsage();
      process.exit(1);
    }
  }

  if (parsed.serve_static != null) {
    opts.serve_static = parsed.serve_static;
  }
  if (parsed.start_rethinkdb != null) {
    opts.start_rethinkdb = true;
  }

  // Normalize horizon socket options
  if (parsed.port != null) {
    opts.port = parsed.port;
  }
  if (parsed.bind != null) {
    opts.hosts = parsed.bind;
  }
  if (opts.hosts.indexOf('all') !== -1) {
    opts.hosts = [ '0.0.0.0' ];
  }

  // Http options
  if (parsed.insecure != null) {
    opts.insecure = true;
  }

  return opts;
};

const startHorizonServer = (servers, opts) => {
  logger.info('Starting Horizon...');
  try {
    return new horizonServer.Server(servers, {
      auto_create_table: opts.auto_create.table,
      auto_create_index: opts.auto_create.index,
      rdb_port: opts.rdb.port,
      auth: {
        allow_unauthenticated: opts.allow_unauthenticated,
      },
    });
  } catch (e) {
    logger.error('Failed creating Horizon server:', e);
    process.exit(1);
  }
};

// Actually serve based on the already validated options
const runCommand = (opts) => {
  if (opts.debug) {
    logger.level = 'debug';
  }
  let servers;

  if (opts.project != null) {
    try {
      process.chdir(opts.project);
    } catch (e) {
      console.error(`No project named ${opts.project}`);
      process.exit(1);
    }
  }

  return (
    opts.insecure ?
      createInsecureServers(opts) : createSecureServers(opts)
  ).then((servs) => {
    servers = servs;
  }).then(() => {
    if (opts.start_rethinkdb) {
      return start_rdb_server().then((rdbOpts) => {
        opts.rdb.port = rdbOpts.driverPort;
        // Don't need to check for host, always localhost.
      });
    }
  }).then(() => {
    return startHorizonServer(servers, opts);
  });
};


module.exports = {
  addArguments,
  processConfig,
  runCommand,
};
