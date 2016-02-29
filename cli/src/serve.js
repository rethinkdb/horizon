'use strict';

const horizon_server = require('@horizon/server');

const fs = require('fs');
const http = require('http');
const https = require('https');
const logger = horizon_server.logger;
const path = require('path');
const toml = require('toml');
const url = require('url');

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

  parser.addArgument([ '--config' ],
    { type: 'string', defaultValue: '.hzconfig', metavar: 'PATH',
      help: 'Path to the config file to use, defaults to ".hzconfig".' });
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

const default_config = () => ({

  config_file: './.hzconfig',
  debug: false,
  project: null,

  hosts: [ 'localhost' ],
  port: 8181,

  start_rethinkdb: false,
  serve_static: undefined,

  insecure: false,
  key_file: './key.pem',
  cert_file: './cert.pem',

  auto_create_table: false,
  auto_create_index: false,

  rdb_host: 'localhost',
  rdb_port: 28015,

});

const read_config_from_file = (config, parsed) => {
  let file_data;
  if (parsed.config_file) {
    // Use specified config file - error if it doesn't exist
    file_data = fs.readFileSync(parsed.config_file);
  } else {
    // Try default config file - ignore if it doesn't exist
    try {
      file_data = fs.readFileSync(config.config_file);
    } catch (err) {
      return config;
    }
  }

  const file_config = toml.parse(file_data);

  for (const field in file_config) {
    config[field] = file_config[field];
  }

  return config;
};

const env_regex = /^HZ_([A-Z]+([_]?[A-Z]+)*)$/;
const read_config_from_env = (config) => {
  for (const env_var in process.env) {
    const matches = env_regex.exec(env_var);
    if (matches && matches[1]) {
      const env_var_name = matches[1];
      const dest_var_name = env_var_name.toLowerCase();
      const value = process.env[env_var_name];

      if ([ 'false', 'true' ].indexOf(value.toLowerCase()) !== -1) {
        config[dest_var_name] = (value.toLowerCase() === 'true');
      } else if (dest_var_name === 'port') {
        config[dest_var_name] = parseInt(value);
      } else if (dest_var_name === 'bind') {
        config[dest_var_name] = value.split(',');
      } else {
        config[dest_var_name] = value;
      }
    }
  }

  return config
};

const read_config_from_flags = (config, parsed) => {
  // Dev mode
  if (parsed.dev) {
    config.debug = true;
    config.allow_unauthenticated = true;
    config.insecure = true;
    config.start_rethinkdb = true;
    config.auto_create_table = true;
    config.auto_create_index = true;
    config.serve_static = 'dist';
  }

  // Sanity check
  if (parsed.start_rethinkdb && parsed.connect) {
    logger.error('Cannot provide both --start-rethinkdb and --connect');
    process.exit(1);
  }

  if (parsed.project != null) {
    config.project = parsed.project;
  }

  if (parsed.auto_create_table != null) {
    config.auto_create_table = true;
  }
  if (parsed.auto_create_index != null) {
    config.auto_create_index = true;
  }

  // Normalize RethinkDB connection options
  if (parsed.connect != null) {
    const host_port = parsed.connect.split(':');
    if (host_port.length === 1) {
      config.rdb_host = host_port[0];
    } else if (host_port.length === 2) {
      config.rdb_host = host_port[0];
      config.rdb_port = host_port[1];
    } else {
      logger.error(`Expected --connect HOST:PORT, but found "${parsed.connect}"`);
      parsed.printUsage();
      process.exit(1);
    }
  }

  if (parsed.serve_static != null) {
    config.serve_static = parsed.serve_static;
  }
  if (parsed.start_rethinkdb != null) {
    config.start_rethinkdb = true;
  }

  // Normalize horizon socket options
  if (parsed.port != null) {
    config.port = parsed.port;
  }
  if (parsed.bind != null) {
    config.bind = parsed.bind;
  }
  if (config.bind.indexOf('all') !== -1) {
    config.bind = [ '0.0.0.0' ];
  }

  // Http options
  if (parsed.insecure != null) {
    config.insecure = true;
  }

  return config;
};


// Command-line flags have the highest precedence, followed by environment variables,
// then the config file, and finally the default values.
const processConfig = (parsed) => {
  let config;

  config = default_config();
  config = read_config_from_file(config, parsed);
  config = read_config_from_env(config, parsed);
  config = read_config_from_flags(config, parsed);

  return config;
};

const startHorizonServer = (servers, opts) => {
  logger.info('Starting Horizon...');
  try {
    return new horizon_server.Server(servers, {
      auto_create_table: opts.auto_create_table,
      auto_create_index: opts.auto_create_index,
      rdb_host: opts.rdb_host,
      rdb_port: opts.rdb_port,
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
  }).then((hz_serv) => {
    if (opts.auth) {
      opts.auth.keys().forEach((name) => {
        const provider = horizon_server.auth[name];
        if (provider) {
          horizon_server.add_auth_provider(provider, opts.auth[name]);
        } else {
          logger.error(`Unrecognized auth provider "${name}"`);
          process.exit(1);
        }
      });
    }
  });
};


module.exports = {
  addArguments,
  processConfig,
  runCommand,
};
