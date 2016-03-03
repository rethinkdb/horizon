'use strict';

const horizon_server = require('@horizon/server');

const fs = require('fs');
const hasbinSync = require('hasbin').sync;
const http = require('http');
const https = require('https');
const logger = horizon_server.logger;
const path = require('path');
const toml = require('toml');
const url = require('url');
const execSync = require('child_process').execSync;

const start_rdb_server = require('./utils/start_rdb_server');

const RETHINKDB_REQ_VERSION = [2,2,3];

const addArguments = (parser) => {
  parser.addArgument([ 'project' ],
    { type: 'string', nargs: '?',
      help: 'Change to this directory before serving' });

  parser.addArgument([ '--bind', '-b' ],
    { type: 'string', action: 'append', metavar: 'HOST',
      help: 'Local hostname to serve horizon on (repeatable).' });

  parser.addArgument([ '--port', '-p' ],
    { type: 'int', metavar: 'PORT',
      help: 'Local port to serve horizon on.' });

  parser.addArgument([ '--connect', '-c' ],
    { type: 'string', metavar: 'HOST:PORT',
      help: 'Host and port of the RethinkDB server to connect to.' });

  parser.addArgument([ '--key-file' ],
    { type: 'string', metavar: 'PATH',
      help: 'Path to the key file to use, defaults to "./key.pem".' });

  parser.addArgument([ '--cert-file' ],
    { type: 'string', metavar: 'PATH',
      help: 'Path to the cert file to use, defaults to "./cert.pem".' });

  parser.addArgument([ '--allow-unauthenticated' ],
    { action: 'storeTrue',
      help: 'Whether to allow unauthenticated Horizon connections.' });

  parser.addArgument([ '--allow-anonymous' ],
    { action: 'storeTrue',
      help: 'Whether to allow anonymous Horizon connections.' });

  parser.addArgument([ '--debug' ],
    { action: 'storeTrue',
      help: 'Enable debug logging.' });

  parser.addArgument([ '--insecure' ],
    { action: 'storeTrue',
      help: 'Serve insecure websockets, ignore --key-file and ' +
      '--cert-file.' });

  parser.addArgument([ '--start-rethinkdb' ],
    { action: 'storeTrue',
      help: 'Start up a RethinkDB server in the current directory' });

  parser.addArgument([ '--auto-create-table' ],
    { action: 'storeTrue',
      help: 'Create tables used by requests if they do not exist.' });

  parser.addArgument([ '--auto-create-index' ],
    { action: 'storeTrue',
      help: 'Create indexes used by requests if they do not exist.' });

  parser.addArgument([ '--serve-static' ],
    { type: 'string',
      nargs: '?',
      metavar: 'PATH',
      help: 'Serve static files from a directory, defaults to "./dist".' });

  parser.addArgument([ '--dev' ],
    { action: 'storeTrue',
      help: 'Runs the server in development mode, this sets ' +
      '--debug, ' +
      '--insecure, ' +
      '--auto-create-tables, ' +
      '--start-rethinkdb, ' +
      '--serve-static, ' +
      'and --auto-create-indexes.' });

  parser.addArgument([ '--config' ],
    { type: 'string', metavar: 'PATH',
      help: 'Path to the config file to use, defaults to ".hzconfig".' });

  parser.addArgument([ '--auth' ],
    { type: 'string', action: 'append', metavar: 'PROVIDER,ID,SECRET', defaultValue: [ ],
      help: 'Auth provider and options comma-separated, e.g. "facebook,<id>,<secret>".' });

  parser.addArgument([ '--auth-redirect' ],
    { type: 'string', metavar: 'URL',
      help: 'The URL to redirect to upon completed authentication, defaults to "/".' });
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
  // Serve client files directly
  if (req_path === '/' || req_path === '') {
    serve_file(path.join(distDir, 'index.html'), res);
  } else if (!req_path.match(/\/horizon\/.*$/)) {
    // All other static files come from the dist directory
    serve_file(path.join(distDir, req_path), res);
  }
  // Fall through otherwise. Should be handled by horizon server
};

const createInsecureServers = (opts) => {
  logger.warn(`Creating insecure HTTP server.`);
  let http_servers = new Set();
  let numReady = 0;
  return new Promise((resolve) => {
    opts.bind.forEach((host) => {
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
    opts.bind.forEach((host) => {
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

  config: './.hzconfig',
  debug: false,
  project: null,

  bind: [ 'localhost' ],
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

  allow_anonymous: false,
  allow_unauthenticated: false,
  auth_redirect: '/',

  auth: { }
});

const read_config_from_file = (config, parsed) => {
  let file_data;
  if (parsed.config) {
    // Use specified config file - error if it doesn't exist
    file_data = fs.readFileSync(parsed.config);
  } else {
    // Try default config file - ignore if anything goes wrong
    try {
      file_data = fs.readFileSync(config.config);
    } catch (err) {
      return config;
    }
  }

  const file_config = toml.parse(file_data);
  for (const field in file_config) {
    if (field === 'auth') {
      for (const provider in file_config.auth) {
        config.auth[provider] = file_config.auth[provider];
      }
    } else {
      config[field] = file_config[field];
    }
  }
  return config;
};

const env_regex = /^HZ_([A-Z]+([_]?[A-Z]+)*)$/;
const read_config_from_env = (config) => {
  for (const env_var in process.env) {
    const matches = env_regex.exec(env_var);
    if (matches && matches[1]) {
      const dest_var_name = matches[1].toLowerCase();
      const path = dest_var_name.split('_');
      let value = process.env[env_var];

      if ([ 'false', 'true' ].indexOf(value.toLowerCase()) !== -1) {
        value = (value.toLowerCase() === 'true');
      }

      if (dest_var_name === 'port') {
        config[dest_var_name] = parseInt(value);
      } else if (dest_var_name === 'bind') {
        config[dest_var_name] = value.split(',');
      } else if (path[0] === 'auth' && path.length === 3) {
        if (!config.auth[path[1]]) {
          config.auth[path[1]] = { };
        }

        if (path[2] === 'id') {
          config.auth[path[1]].id = value;
        } else if (path[2] === 'secret') {
          config.auth[path[1]].secret = value;
        }
      } else {
        config[dest_var_name] = value;
      }
    }
  }

  return config;
};

const read_config_from_flags = (config, parsed) => {
  // Sanity check
  if (parsed.start_rethinkdb && parsed.connect) {
    logger.error('Cannot provide both --start-rethinkdb and --connect');
    process.exit(1);
  }

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

  if (parsed.project !== null) {
    config.project = parsed.project;
  }

  // Simple boolean flags
  const bool_flags = [ 'debug',
                       'insecure',
                       'start_rethinkdb',
                       'auto_create_index',
                       'auto_create_table',
                       'allow_unauthenticated',
                       'allow_anonymous',
                       'auth_redirect' ];

  bool_flags.forEach((key) => {
    if (parsed[key]) {
      config[key] = true;
    }
  });

  // Normalize RethinkDB connection options
  if (parsed.connect !== null) {
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

  if (parsed.serve_static !== null) {
    config.serve_static = parsed.serve_static;
  }

  // Normalize horizon socket options
  if (parsed.port !== null) {
    config.port = parsed.port;
  }
  if (parsed.bind !== null) {
    config.bind = parsed.bind;
  }
  if (config.bind.indexOf('all') !== -1) {
    config.bind = [ '0.0.0.0' ];
  }

  // Auth options
  parsed.auth.forEach((auth_options) => {
    const params = auth_options.split(',');
    if (params.length === 3) {
      config.auth[params[0]] = { id: params[1], secret: params[2] };
    } else {
      logger.error(`Expected --auth PROVIDER,ID,SECRET, but found "${auth_options}"`);
      parsed.printUsage();
      process.exit(1);
    }
  });

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
        allow_anonymous: opts.allow_anonymous,
        success_redirect: opts.auth_redirect,
        failure_redirect: opts.auth_redirect,
      },
    });
  } catch (err) {
    logger.error(`Failed creating Horizon server: ${err}`);
    process.exit(1);
  }
};

// Actually serve based on the already validated options
const runCommand = (opts) => {
  if (opts.debug) {
    logger.level = 'debug';
  }

  if (opts.project !== null) {
    try {
      process.chdir(opts.project);

    } catch (err) {
      logger.error(`Failed to find "${opts.project}" project: ${err}`);
      process.exit(1);
    }
  }

  let http_servers, hz_instance;

  const shutdown = () => {
    if (hz_instance) {
      hz_instance.close();
    }
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  return (
    opts.insecure ?
      createInsecureServers(opts) : createSecureServers(opts)
  ).then((servers) => {
    http_servers = servers;
    if (opts.start_rethinkdb) {
      const result = hasbinSync('rethinkdb');
      if (!result) {
        logger.error('RethinkDB binary not found in $PATH, please install RethinkDB');
        process.exit(1);
      }

      const output = execSync('rethinkdb --version', { timeout: 250 }).toString();
      const output_split = output.split(' ');
      if (output_split.length >= 2) {
        // Assuming that it is currently x.x.x format

        let versions;
        // Check if prerelease version
        const hyphenIndex = output_split[1].indexOf('-');
        if (hyphenIndex === -1) {
          versions = output_split[1].split('.').map((val) => parseInt(val));
        // Just remove the prerelease version portion
        } else {
          // Split version chunk on period
          versions = output_split[1].split('.');
          // Grab portion of string up to hyphen
          versions[2] = versions[2].substr(0, hyphenIndex - 1);
          // Convert all values to integers
          versions = versions.map((val) => parseInt(val));
        }

        // Check that split resulted in three [x, x, x] and all values are integers
        if (versions.length === 3 && versions.every((val) => Number.isInteger(val))) {
          // Check in driection of semvar to major versions
          if (versions[2] < RETHINKDB_REQ_VERSION[2] ||
              versions[1] < RETHINKDB_REQ_VERSION[1] ||
              versions[0] < RETHINKDB_REQ_VERSION[0]) {
            logger.error(`RethinkDB (${output_split[1]}) is below required version (2.2.5) for use with Horizon`);
            process.exit(1);
          } else {
            logger.info(output);
          }
        } else {
          logger.error('Unable to determine RethinkDB version and continuing, please check RethinkDB is >= 2.2.5');
        }
      } else {
        logger.error('Unable to determine RethinkDB version and continuing, please check RethinkDB is >= 2.2.5');
      }

      return start_rdb_server().then((rdbOpts) => {
        // Don't need to check for host, always localhost.
        opts.rdb_port = rdbOpts.driverPort;
      });
    }
  }).then(() => {
    hz_instance = startHorizonServer(http_servers, opts);
  }).then(() => {
    if (opts.auth) {
      for (const name in opts.auth) {
        const provider = horizon_server.auth[name];
        if (provider) {
          hz_instance.add_auth_provider(provider, {
            path: name,
            client_id: opts.auth[name].id,
            client_secret: opts.auth[name].secret
          });
        } else {
          logger.error(`Unrecognized auth provider "${name}"`);
          process.exit(1);
        }
      }
    }
  }).catch((err) => {
    logger.error(`Error starting Horizon Server: ${err}`);
    process.exit(1);
  });
};

module.exports = {
  addArguments,
  processConfig,
  runCommand,
};
