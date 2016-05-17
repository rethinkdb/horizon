'use strict';

const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const toml = require('toml');
const url = require('url');
const chalk = require('chalk');

const parse_yes_no_option = require('./utils/parse_yes_no_option');
const start_rdb_server = require('./utils/start_rdb_server');
const interrupt = require('./utils/interrupt');
const exitWithError = require('./utils/exit_with_error');
const isDirectory = require('./utils/is_directory');

const horizon_server = require('@horizon/server');
const logger = horizon_server.logger;

const TIMEOUT_30_SECONDS = 30 * 1000;

const default_config_file = '.hz/config.toml';

const addArguments = (parser) => {
  parser.addArgument([ 'project_path' ],
    { type: 'string', nargs: '?',
      help: 'Change to this directory before serving' });

  parser.addArgument([ '--project-name', '-n' ],
    { type: 'string', action: 'store', metavar: 'NAME',
      help: 'Name of the Horizon project. Determines the name of ' +
            'the RethinkDB database that stores the project data.' });

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
      help: 'Path to the key file to use, defaults to "./horizon-key.pem".' });

  parser.addArgument([ '--cert-file' ],
    { type: 'string', metavar: 'PATH',
      help: 'Path to the cert file to use, defaults to "./horizon-cert.pem".' });

  parser.addArgument([ '--token-secret' ],
    { type: 'string', metavar: 'SECRET',
      help: 'Key for signing jwts. Default is random on each run' });

  parser.addArgument([ '--allow-unauthenticated' ],
    { type: 'string', metavar: 'yes|no', constant: 'yes', nargs: '?',
      help: 'Whether to allow unauthenticated Horizon connections.' });

  parser.addArgument([ '--allow-anonymous' ],
    { type: 'string', metavar: 'yes|no', constant: 'yes', nargs: '?',
      help: 'Whether to allow anonymous Horizon connections.' });

  parser.addArgument([ '--debug' ],
    { type: 'string', metavar: 'yes|no', constant: 'yes', nargs: '?',
      help: 'Enable debug logging.' });

  parser.addArgument([ '--secure' ],
    { type: 'string', metavar: 'yes|no', constant: 'yes', nargs: '?',
      help: 'Serve secure websockets, requires --key-file and ' +
      '--cert-file if true, on by default.' });

  parser.addArgument([ '--start-rethinkdb' ],
    { type: 'string', metavar: 'yes|no', constant: 'yes', nargs: '?',
      help: 'Start up a RethinkDB server in the current directory' });

  parser.addArgument([ '--auto-create-collection' ],
    { type: 'string', metavar: 'yes|no', constant: 'yes', nargs: '?',
      help: 'Create collections used by requests if they do not exist.' });

  parser.addArgument([ '--auto-create-index' ],
    { type: 'string', metavar: 'yes|no', constant: 'yes', nargs: '?',
      help: 'Create indexes used by requests if they do not exist.' });

  parser.addArgument([ '--permissions' ],
    { type: 'string', metavar: 'yes|no', constant: 'yes', nargs: '?',
      help: 'Enables or disables checking permissions on requests.' });

  parser.addArgument([ '--serve-static' ],
    { type: 'string', metavar: 'PATH', nargs: '?', constant: './dist',
      help: 'Serve static files from a directory, defaults to "./dist".' });

  parser.addArgument([ '--dev' ],
    { action: 'storeTrue',
      help: 'Runs the server in development mode, this sets ' +
      '--secure=no, ' +
      '--permissions=no, ' +
      '--auto-create-collection=yes, ' +
      '--auto-create-index=yes, ' +
      '--start-rethinkdb=yes, ' +
      '--allow-unauthenticated=yes, ' +
      '--allow-anonymous=yes, ' +
      'and --serve-static=./dist.' });

  parser.addArgument([ '--config' ],
    { type: 'string', metavar: 'PATH',
      help: 'Path to the config file to use, defaults to "${default_config_file}".' });

  parser.addArgument([ '--auth' ],
    { type: 'string', action: 'append', metavar: 'PROVIDER,ID,SECRET', defaultValue: [ ],
      help: 'Auth provider and options comma-separated, e.g. "facebook,<id>,<secret>".' });

  parser.addArgument([ '--auth-redirect' ],
    { type: 'string', metavar: 'URL',
      help: 'The URL to redirect to upon completed authentication, defaults to "/".' });
};

const make_default_config = () => ({
  config: null,
  debug: false,
  // Default to current directory for path
  project_path: '.',
  // Default to current directory name for project name
  project_name: null,

  bind: [ 'localhost' ],
  port: 8181,

  start_rethinkdb: false,
  serve_static: null,

  secure: true,
  permissions: true,
  key_file: './horizon-key.pem',
  cert_file: './horizon-cert.pem',

  auto_create_collection: false,
  auto_create_index: false,

  rdb_host: 'localhost',
  rdb_port: 28015,

  token_secret: null,
  allow_anonymous: false,
  allow_unauthenticated: false,
  auth_redirect: '/',

  auth: { },
});

const default_config = make_default_config();


// Simple file server. 404s if file not found, 500 if file error,
// otherwise serve it with a mime-type suggested by its file extension.
const serve_file = (file_path, res) => {
  fs.access(file_path, fs.R_OK | fs.F_OK, (exists) => {
    if (exists) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end(`File "${file_path}" not found\n`);
    } else {
      fs.lstat(file_path, (err, stats) => {
        if (err) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end(`${err}\n`);
        } else if (stats.isFile()) {
          fs.readFile(file_path, 'binary', (err2, file) => {
            if (err2) {
              res.writeHead(500, { 'Content-Type': 'text/plain' });
              res.end(`${err2}\n`);
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
        } else if (stats.isDirectory()) {
          serve_file(path.join(file_path, 'index.html'), res);
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

const initialize_servers = (ctor, opts) => {
  const servers = new Set();
  let numReady = 0;
  return new Promise((resolve) => {
    opts.bind.forEach((host) => {
      const srv = ctor().listen(opts.port, host);
      servers.add(srv);
      if (opts.serve_static) {
        if (opts.serve_static === 'dist') {
          // do nothing, this is the default
        } else if (opts.project_path !== '.') {
          const pth = path.join(opts.project_path, opts.serve_static);
          console.info(`Static files being served from ${pth}`);
        } else {
          console.info(`Static files being served from ${opts.serve_static}`);
        }
        srv.on('request', fileServer(opts.serve_static));
      }
      srv.on('listening', () => {
        console.info(`App available at http://${srv.address().address}:` +
                    `${srv.address().port}`);
        if (++numReady === servers.size) {
          resolve(servers);
        }
      });
      srv.on('error', (err) => {
        exitWithError(`HTTP${opts.secure ? 'S' : ''} server: ${err}`);
      });
    });
  });
};

const createInsecureServers = (opts) => {
  if (!opts._dev_flag_used) {
    console.error(chalk.red.bold('WARNING: Serving app insecurely.'));
  }
  return initialize_servers(() => new http.Server(), opts);
};

const readCertFile = (file) => {
  try {
    return fs.readFileSync(path.resolve(file));
  } catch (err) {
    throw new Error(
      `Could not access file "${file}" for running HTTPS server: ${err}`);
  }
};

const createSecureServers = (opts) => {
  const key = readCertFile(opts.key_file);
  const cert = readCertFile(opts.cert_file);
  return initialize_servers(() => new https.Server({ key, cert }), opts);
};

const yes_no_options = [ 'debug',
                         'secure',
                         'permissions',
                         'start_rethinkdb',
                         'auto_create_index',
                         'auto_create_collection',
                         'allow_unauthenticated',
                         'allow_anonymous',
                         'auth_redirect' ];

const parse_connect = (connect, config) => {
  const host_port = connect.split(':');
  if (host_port.length === 1) {
    config.rdb_host = host_port[0];
  } else if (host_port.length === 2) {
    config.rdb_host = host_port[0];
    config.rdb_port = parseInt(host_port[1]);
    if (isNaN(config.rdb_port) || config.rdb_port < 0 || config.rdb_port > 65535) {
      throw new Error(`Invalid port: "${host_port[1]}".`);
    }
  } else {
    throw new Error(`Expected --connect HOST:PORT, but found "${connect}".`);
  }
};

const read_config_from_file = (project_path, config_file) => {
  const config = { auth: { } };

  let file_data, configFilename;

  if (config_file) {
    configFilename = config_file;
  } else if (project_path && !config_file) {
    configFilename = `${project_path}/${default_config_file}`;
  } else {
    configFilename = default_config_file;
  }

  try {
    file_data = fs.readFileSync(configFilename);
  } catch (err) {
    return config;
  }

  const file_config = toml.parse(file_data);
  for (const field in file_config) {
    if (field === 'connect') {
      parse_connect(file_config.connect, config);
    } else if (yes_no_options.indexOf(field) !== -1) {
      config[field] = parse_yes_no_option(file_config[field], field);
    } else if (default_config[field] !== undefined) {
      config[field] = file_config[field];
    } else {
      throw new Error(`Unknown config parameter: "${field}".`);
    }
  }

  return config;
};

const env_regex = /^HZ_([A-Z]+([_]?[A-Z]+)*)$/;
const read_config_from_env = () => {
  const config = { auth: { } };

  for (const env_var in process.env) {
    const matches = env_regex.exec(env_var);
    if (matches && matches[1]) {
      const dest_var_name = matches[1].toLowerCase();
      const var_path = dest_var_name.split('_');
      const value = process.env[env_var];

      if (dest_var_name === 'connect') {
        parse_connect(value, config);
      } else if (dest_var_name === 'bind') {
        config[dest_var_name] = value.split(',');
      } else if (var_path[0] === 'auth' && var_path.length === 3) {
        config.auth[var_path[1]] = config.auth[var_path[1]] || { };

        if (var_path[2] === 'id') {
          config.auth[var_path[1]].id = value;
        } else if (var_path[2] === 'secret') {
          config.auth[var_path[1]].secret = value;
        }
      } else if (yes_no_options.indexOf(dest_var_name) !== -1) {
        config[dest_var_name] = parse_yes_no_option(value, dest_var_name);
      } else if (default_config[dest_var_name] !== undefined) {
        config[dest_var_name] = value;
      }
    }
  }

  return config;
};

const read_config_from_flags = (parsed) => {
  const config = { auth: { } };

  // Dev mode
  if (parsed.dev) {
    config.allow_unauthenticated = true;
    config.allow_anonymous = true;
    config.secure = false;
    config.permissions = false;
    config.start_rethinkdb = true;
    config.auto_create_collection = true;
    config.auto_create_index = true;
    config.serve_static = 'dist';
    config._dev_flag_used = true;
  }

  if (parsed.project_name !== null && parsed.project_name !== undefined) {
    config.project_name = parsed.project_name;
  }

  if (parsed.project_path !== null && parsed.project_path !== undefined) {
    config.project_path = parsed.project_path;
  }

  // Simple 'yes' or 'no' (or 'true' or 'false') flags
  yes_no_options.forEach((key) => {
    const value = parse_yes_no_option(parsed[key], key);
    if (value !== undefined) {
      config[key] = value;
    }
  });

  // Normalize RethinkDB connection options
  if (parsed.connect !== null && parsed.connect !== undefined) {
    // Disable start_rethinkdb if it was enabled by dev mode
    if (parsed.dev && parse_yes_no_option(parsed.start_rethinkdb) === undefined) {
      config.start_rethinkdb = false;
    }
    parse_connect(parsed.connect, config);
  }

  if (parsed.serve_static !== null && parsed.serve_static !== undefined) {
    config.serve_static = parsed.serve_static;
  }

  // Normalize horizon socket options
  if (parsed.port !== null && parsed.port !== undefined) {
    config.port = parsed.port;
  }
  if (parsed.bind !== null && parsed.bind !== undefined) {
    config.bind = parsed.bind;

    if (config.bind.indexOf('all') !== -1) {
      config.bind = [ '0.0.0.0' ];
    }
  }

  if (parsed.token_secret !== null && parsed.token_secret !== undefined) {
    config.token_secret = parsed.token_secret;
  }

  // Auth options
  if (parsed.auth !== null && parsed.auth !== undefined) {
    parsed.auth.forEach((auth_options) => {
      const params = auth_options.split(',');
      if (params.length !== 3) {
        throw new Error(`Expected --auth PROVIDER,ID,SECRET, but found "${auth_options}"`);
      }
      config.auth[params[0]] = { id: params[1], secret: params[2] };
    });
  }

  return config;
};

const merge_configs = (old_config, new_config) => {
  if (new_config.start_rethinkdb && new_config.rdb_host) {
    throw new Error('Cannot provide both --start-rethinkdb and --connect.');
  }

  for (const key in new_config) {
    if (key === 'rdb_host') {
      old_config.start_rethinkdb = false;
    } else if (key === 'start_rethinkdb') {
      old_config.rdb_host = 'localhost';
    }

    if (key === 'auth') {
      for (const provider in new_config.auth) {
        old_config.auth[provider] = old_config.auth[provider] || { };
        for (const field in new_config.auth[provider]) {
          old_config.auth[provider][field] = new_config.auth[provider][field];
        }
      }
    } else {
      old_config[key] = new_config[key];
    }
  }

  return old_config;
};

// Command-line flags have the highest precedence, followed by environment variables,
// then the config file, and finally the default values.
const processConfig = (parsed) => {
  let config;

  config = make_default_config();
  config = merge_configs(config,
                         read_config_from_file(parsed.project_path, parsed.config));
  config = merge_configs(config, read_config_from_env());
  config = merge_configs(config, read_config_from_flags(parsed));

  if (config.project_name === null) {
    config.project_name = path.basename(path.resolve(config.project_path));
  }

  return config;
};

const startHorizonServer = (servers, opts) => {
  console.log('Starting Horizon...');
  const hzServer = new horizon_server.Server(servers, {
    auto_create_collection: opts.auto_create_collection,
    auto_create_index: opts.auto_create_index,
    permissions: opts.permissions,
    rdb_host: opts.rdb_host,
    rdb_port: opts.rdb_port,
    project_name: opts.project_name,
    auth: {
      token_secret: opts.token_secret,
      allow_unauthenticated: opts.allow_unauthenticated,
      allow_anonymous: opts.allow_anonymous,
      success_redirect: opts.auth_redirect,
      failure_redirect: opts.auth_redirect,
    },
  });
  const timeoutObject = setTimeout(() => {
    console.log(chalk.red.bold('Horizon failed to start after 30 seconds'));
    console.log(chalk.red.bold('Try running hz serve again with the --debug flag'));
    process.exit(1);
  }, TIMEOUT_30_SECONDS);
  hzServer.ready().then(() => {
    clearTimeout(timeoutObject);
    console.log(chalk.green.bold('Horizon ready for connections 🌄'));
  }).catch((err) => {
    console.log(chalk.red.bold(err));
    process.exit(1);
  });
  return hzServer;
};

const change_to_project_dir = (project_path) => {
  if (isDirectory(project_path)) {
    process.chdir(project_path);
  } else {
    exitWithError(`${project_path} is not a directory`);
  }
  if (!isDirectory('.hz')) {
    const nicePathName = project_path === '.' ?
            'this directory' : project_path;
    exitWithError(`${nicePathName} doesn't contain an .hz directory`);
  }
};

// Actually serve based on the already validated options
const runCommand = (opts, done) => {
  if (opts.debug) {
    logger.level = 'debug';
  } else {
    logger.level = 'warn';
  }

  change_to_project_dir(opts.project_path);

  let http_servers, hz_instance;

  interrupt.on_interrupt((done2) => {
    if (hz_instance) {
      hz_instance.close();
    }
    if (http_servers) {
      http_servers.forEach((serv) => {
        serv.close();
      });
    }
    done2();
  });

  return (
    opts.secure ?
      createSecureServers(opts) : createInsecureServers(opts)
  ).then((servers) => {
    http_servers = servers;
    if (opts.start_rethinkdb) {
      return start_rdb_server().then((rdbOpts) => {
        // Don't need to check for host, always localhost.
        opts.rdb_port = rdbOpts.driverPort;
        console.log('RethinkDB');
        console.log(`   ├── Admin interface: http://localhost:${rdbOpts.httpPort}`);
        console.log(`   └── Drivers can connect to port ${rdbOpts.driverPort}`);
      });
    }
  }).then(() => {
    hz_instance = startHorizonServer(http_servers, opts);
  }).then(() => {
    if (opts.auth) {
      for (const name in opts.auth) {
        const provider = horizon_server.auth[name];
        if (!provider) {
          throw new Error(`Unrecognized auth provider "${name}"`);
        }
        hz_instance.add_auth_provider(provider,
                                      Object.assign({}, { path: name }, opts.auth[name]));
      }
    }
  }).catch(done);
};

module.exports = {
  addArguments,
  processConfig,
  runCommand,
  merge_configs,
  make_default_config,
  read_config_from_file,
  read_config_from_env,
  read_config_from_flags,
  change_to_project_dir,
};
