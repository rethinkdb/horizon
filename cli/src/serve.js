'use strict';
const serve = module.exports = {};

const chalk = require('chalk');
const fs = require('fs');
const get_type = require('mime-types').contentType;
const http = require('http');
const https = require('https');
const open = require('open');
const path = require('path');
const toml = require('toml');
const url = require('url');

const parse_yes_no_option = require('./utils/parse_yes_no_option');
const start_rdb_server = require('./utils/start_rdb_server');
const interrupt = require('./utils/interrupt');
const exit_with_error = require('./utils/exit_with_error');
const is_directory = require('./utils/is_directory');
const schema = require('./schema');

const horizon_server = require('@horizon/server');
const logger = horizon_server.logger;

const TIMEOUT_30_SECONDS = 30 * 1000;

const default_config_file = '.hz/config.toml';
const default_secrets_file = '.hz/secrets.toml';
const default_rdb_host = 'localhost';
const default_rdb_port = 28015;
const default_rdb_timeout = 20;

const helpText = 'Serve a Horizon app';

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

  parser.addArgument([ '--rdb-timeout' ],
    { type: 'int', metavar: 'TIMEOUT',
      help: 'Timeout period in seconds for the RethinkDB connection to be opened' });

  parser.addArgument([ '--rdb-user' ],
    { type: 'string', metavar: 'USER',
      help: 'RethinkDB User' });

  parser.addArgument([ '--rdb-password' ],
    { type: 'string', metavar: 'PASSWORD',
      help: 'RethinkDB Password' });

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
      '--schema-file=.hz/schema.toml' +
      'and --serve-static=./dist.' });

  parser.addArgument([ '--config' ],
    { type: 'string', metavar: 'PATH',
      help: 'Path to the config file to use, defaults to "${default_config_file}".' });

  parser.addArgument([ '--schema-file' ],
    { type: 'string', metavar: 'SCHEMA_FILE_PATH',
      help: 'Path to the schema file to use, ' +
      'will attempt to apply schema before starting Horizon server".' });

  parser.addArgument([ '--auth' ],
    { type: 'string', action: 'append', metavar: 'PROVIDER,ID,SECRET', defaultValue: [ ],
      help: 'Auth provider and options comma-separated, e.g. "facebook,<id>,<secret>".' });

  parser.addArgument([ '--auth-redirect' ],
    { type: 'string', metavar: 'URL',
      help: 'The URL to redirect to upon completed authentication, defaults to "/".' });

  parser.addArgument([ '--access-control-allow-origin' ],
    { type: 'string', metavar: 'URL',
      help: 'The URL of the host that can access auth settings, defaults to "".' });

  parser.addArgument([ '--open' ],
    { action: 'storeTrue',
      help: 'Open index.html in the static files folder once Horizon is ready to' +
      ' receive connections' });
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
  open: false,

  secure: true,
  permissions: true,
  key_file: './horizon-key.pem',
  cert_file: './horizon-cert.pem',
  schema_file: null,

  auto_create_collection: false,
  auto_create_index: false,

  rdb_host: null,
  rdb_port: null,
  rdb_user: null,
  rdb_password: null,
  rdb_timeout: null,

  token_secret: null,
  allow_anonymous: false,
  allow_unauthenticated: false,
  auth_redirect: '/',
  access_control_allow_origin: '',

  auth: { },
});

const defaultConfig = make_default_config();


// Simple file server. 404s if file not found, 500 if file error,
// otherwise serve it with a mime-type suggested by its file extension.
const serve_file = (filePath, res) => {
  fs.access(filePath, fs.R_OK | fs.F_OK, (exists) => {
    if (exists) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end(`File "${filePath}" not found\n`);
    } else {
      fs.lstat(filePath, (err, stats) => {
        if (err) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end(`${err}\n`);
        } else if (stats.isFile()) {
          fs.readFile(filePath, 'binary', (err2, file) => {
            if (err2) {
              res.writeHead(500, { 'Content-Type': 'text/plain' });
              res.end(`${err2}\n`);
            } else {
              const type = get_type(path.extname(filePath)) || false;
              if (type) {
                res.writeHead(200, { 'Content-Type': type });
              } else {
                res.writeHead(200);
              }
              res.end(file, 'binary');
            }
          });
        } else if (stats.is_directory()) {
          serve_file(path.join(filePath, 'index.html'), res);
        }
      });
    }
  });
};

const file_server = (distDir) => (req, res) => {
  const reqPath = url.parse(req.url).pathname;
  // Serve client files directly
  if (reqPath === '/' || reqPath === '') {
    serve_file(path.join(distDir, 'index.html'), res);
  } else if (!reqPath.match(/\/horizon\/.*$/)) {
    // All other static files come from the dist directory
    serve_file(path.join(distDir, reqPath), res);
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
        srv.on('request', file_server(opts.serve_static));
      } else {
        srv.on('request', (req, res) => {
          res.writeHead(404);
          res.end('404 Not Found');
        });
      }
      srv.on('listening', () => {
        const protocol = opts.secure ? 'https' : 'http';
        console.info(`App available at ${protocol}://${srv.address().address}:` +
                    `${srv.address().port}`);
        if (++numReady === servers.size) {
          resolve(servers);
        }
      });
      srv.on('error', (err) => {
        exit_with_error(`HTTP${opts.secure ? 'S' : ''} server: ${err}`);
      });
    });
  });
};

const create_insecure_servers = (opts) => {
  if (!opts._dev_flag_used) {
    console.error(chalk.red.bold('WARNING: Serving app insecurely.'));
  }
  return initialize_servers(() => new http.Server(), opts);
};

const read_cert_file = (file) => {
  try {
    return fs.readFileSync(path.resolve(file));
  } catch (err) {
    throw new Error(
      `Could not access file "${file}" for running HTTPS server: ${err}`);
  }
};

const create_secure_servers = (opts) => {
  const key = read_cert_file(opts.key_file);
  const cert = read_cert_file(opts.cert_file);
  return initialize_servers(() => new https.Server({ key, cert }), opts);
};

const yesNoOptions = [ 'debug',
                         'secure',
                         'permissions',
                         'start_rethinkdb',
                         'auto_create_index',
                         'auto_create_collection',
                         'allow_unauthenticated',
                         'allow_anonymous' ];

const parse_connect = (connect, config) => {
  // support rethinkdb:// style connection uri strings
  // expects rethinkdb://host:port` at a minimum but can optionally take a user:pass and db
  // e.g. rethinkdb://user:pass@host:port/db
  const rdb_uri = url.parse(connect);
  if (rdb_uri.protocol === 'rethinkdb:') {
    if (rdb_uri.hostname) {
      config.rdb_host = rdb_uri.hostname;
      config.rdb_port = rdb_uri.port || default_rdb_port;

      // check for user/pass
      if (rdb_uri.auth) {
        const user_pass = rdb_uri.auth.split(':');
        config.rdb_user = user_pass[0];
        config.rdb_password = user_pass[1];
      }

      // set the project name based on the db
      if (rdb_uri.path && rdb_uri.path.replace('/', '') !== '') {
        config.project_name = rdb_uri.path.replace('/', '');
      }
    } else {
      throw new Error(`Expected --connect rethinkdb://HOST, but found "${connect}".`);
    }
  } else {
    // support legacy HOST:PORT connection strings
    const host_port = connect.split(':');
    if (host_port.length === 1) {
      config.rdb_host = host_port[0];
      config.rdb_port = default_rdb_port;
    } else if (host_port.length === 2) {
      config.rdb_host = host_port[0];
      config.rdb_port = parseInt(host_port[1]);
      if (isNaN(config.rdb_port) || config.rdb_port < 0 || config.rdb_port > 65535) {
        throw new Error(`Invalid port: "${host_port[1]}".`);
      }
    } else {
      throw new Error(`Expected --connect HOST:PORT, but found "${connect}".`);
    }
  }
};

const read_config_from_config_file = (project_path, config_file) => {
  const config = { auth: { } };

  let fileData, configFilename;

  if (config_file) {
    configFilename = config_file;
  } else if (project_path && !config_file) {
    configFilename = `${project_path}/${default_config_file}`;
  } else {
    configFilename = default_config_file;
  }

  try {
    fileData = fs.readFileSync(configFilename);
  } catch (err) {
    return config;
  }

  const fileConfig = toml.parse(fileData);
  for (const field in fileConfig) {
    if (field === 'connect') {
      parse_connect(fileConfig.connect, config);
    } else if (yesNoOptions.indexOf(field) !== -1) {
      config[field] = parse_yes_no_option(fileConfig[field], field);
    } else if (defaultConfig[field] !== undefined) {
      config[field] = fileConfig[field];
    } else {
      throw new Error(`Unknown config parameter: "${field}".`);
    }
  }
  return config;
};

const read_config_from_secrets_file = (projectPath, secretsFile) => {
  const config = { auth: { } };

  let fileData, secretsFilename;

  if (secretsFile) {
    secretsFilename = secretsFile;
  } else if (projectPath && !secretsFile) {
    secretsFilename = `${projectPath}/${default_secrets_file}`;
  } else {
    secretsFilename = default_secrets_file;
  }

  try {
    fileData = fs.readFileSync(secretsFilename);
  } catch (err) {
    return config;
  }

  const fileConfig = toml.parse(fileData);
  for (const field in fileConfig) {
    if (field === 'connect') {
      parse_connect(fileConfig.connect, config);
    } else if (yesNoOptions.indexOf(field) !== -1) {
      config[field] = parse_yes_no_option(fileConfig[field], field);
    } else if (defaultConfig[field] !== undefined) {
      config[field] = fileConfig[field];
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
      const destVarName = matches[1].toLowerCase();
      const varPath = destVarName.split('_');
      const value = process.env[env_var];

      if (destVarName === 'connect') {
        parse_connect(value, config);
      } else if (destVarName === 'bind') {
        config[destVarName] = value.split(',');
      } else if (varPath[0] === 'auth') {
        if (varPath.length !== 3) {
          console.log(`Ignoring malformed Horizon environment variable: "${env_var}", ` +
                      'should be HZ_AUTH_{PROVIDER}_ID or HZ_AUTH_{PROVIDER}_SECRET.');
        } else {
          config.auth[varPath[1]] = config.auth[varPath[1]] || { };

          if (varPath[2] === 'id') {
            config.auth[varPath[1]].id = value;
          } else if (varPath[2] === 'secret') {
            config.auth[varPath[1]].secret = value;
          }
        }
      } else if (yesNoOptions.indexOf(destVarName) !== -1) {
        config[destVarName] = parse_yes_no_option(value, destVarName);
      } else if (defaultConfig[destVarName] !== undefined) {
        config[destVarName] = value;
      }
    }
  }

  return config;
};

// Handles reading configuration from the parsed flags
//  NOTE: New flags must be manually added here or they will not apply correctly
const read_config_from_flags = (parsed) => {
  const config = { auth: { } };

  // Dev mode
  if (parsed.dev) {
    config.access_control_allow_origin = '*';
    config.allow_unauthenticated = true;
    config.allow_anonymous = true;
    config.secure = false;
    config.permissions = false;
    config.start_rethinkdb = true;
    config.auto_create_collection = true;
    config.auto_create_index = true;
    config.serve_static = 'dist';
    config._dev_flag_used = true;
    config.schema_file = '.hz/schema.toml';

    if (parsed.start_rethinkdb === null || parsed.start_rethinkdb === undefined) {
      config._start_rethinkdb_implicit = true;
    }
  }

  if (parsed.project_name !== null && parsed.project_name !== undefined) {
    config.project_name = parsed.project_name;
  }

  if (parsed.project_path !== null && parsed.project_path !== undefined) {
    config.project_path = parsed.project_path;
  }

  // Normalize RethinkDB connection options
  if (parsed.connect !== null && parsed.connect !== undefined) {
    parse_connect(parsed.connect, config);
  }

  // Simple 'yes' or 'no' (or 'true' or 'false') flags
  yesNoOptions.forEach((key) => {
    const value = parse_yes_no_option(parsed[key], key);
    if (value !== undefined) {
      config[key] = value;
    }
  });

  if (parsed.serve_static !== null && parsed.serve_static !== undefined) {
    config.serve_static = parsed.serve_static;
  }

  if (parsed.schema_file !== null && parsed.schema_file !== undefined) {
    config.schema_file = parsed.schema_file;
  }

  // Normalize horizon socket options
  if (parsed.port !== null && parsed.port !== undefined) {
    config.port = parsed.port;
  }
  if (parsed.bind !== null && parsed.bind !== undefined) {
    config.bind = parsed.bind;
  }

  if (parsed.rdb_timeout !== null && parsed.rdb_timeout !== undefined) {
    config.rdb_timeout = parsed.rdb_timeout;
  }

  if (parsed.rdb_user !== null && parsed.rdb_user !== undefined) {
    config.rdb_user = parsed.rdb_user;
  }

  if (parsed.rdb_password !== null && parsed.rdb_password !== undefined) {
    config.rdb_password = parsed.rdb_password;
  }

  if (parsed.token_secret !== null && parsed.token_secret !== undefined) {
    config.token_secret = parsed.token_secret;
  }

  if (parsed.access_control_allow_origin !== null &&
      parsed.access_control_allow_origin !== undefined) {
    config.access_control_allow_origin = parsed.access_control_allow_origin;
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

  // Set open config from flag
  config.open = parsed.open;

  return config;
};

const merge_configs = (old_config, new_config) => {
  // Disable start_rethinkdb if it was enabled by dev mode but we already have a host
  if (new_config._start_rethinkdb_implicit) {
    if (old_config.rdb_host) {
      delete new_config.start_rethinkdb;
    }
  } else if (new_config.start_rethinkdb && new_config.rdb_host) {
    throw new Error('Cannot provide both --start-rethinkdb and --connect.');
  }

  for (const key in new_config) {
    if (key === 'rdb_host') {
      old_config.start_rethinkdb = false;
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
  config = merge_configs(config, read_config_from_config_file(parsed.project_path, parsed.config));
  config = merge_configs(config, read_config_from_secrets_file(parsed.project_path, parsed.config));
  config = merge_configs(config, read_config_from_env());
  config = merge_configs(config, read_config_from_flags(parsed));

  if (config.project_name === null) {
    config.project_name = path.basename(path.resolve(config.project_path));
  }

  if (config.bind.indexOf('all') !== -1) {
    config.bind = [ '0.0.0.0' ];
  }

  if (!config.rdb_host) {
    config.rdb_host = default_rdb_host;
  }

  if (!config.rdb_port) {
    config.rdb_port = default_rdb_port;
  }

  if (!config.rdb_timeout) {
    config.rdb_timeout = default_rdb_timeout;
  }

  return config;
};

const startHorizonServer = (servers, opts) => {
  console.log('Starting Horizon...');
  const hzServer = new horizon_server.Server(servers, {
    auto_create_collection: opts.auto_create_collection,
    auto_create_index: opts.auto_create_index,
    permissions: opts.permissions,
    project_name: opts.project_name,
    access_control_allow_origin: opts.access_control_allow_origin,
    auth: {
      token_secret: opts.token_secret,
      allow_unauthenticated: opts.allow_unauthenticated,
      allow_anonymous: opts.allow_anonymous,
      success_redirect: opts.auth_redirect,
      failure_redirect: opts.auth_redirect,
    },
    rdb_host: opts.rdb_host,
    rdb_port: opts.rdb_port,
    rdb_user: opts.rdb_user || null,
    rdb_password: opts.rdb_password || null,
    rdb_timeout: opts.rdb_timeout || null,
  });
  const timeoutObject = setTimeout(() => {
    console.log(chalk.red.bold('Horizon failed to start after 30 seconds'));
    console.log(chalk.red.bold('Try running hz serve again with the --debug flag'));
    process.exit(1);
  }, TIMEOUT_30_SECONDS);
  hzServer.ready().then(() => {
    clearTimeout(timeoutObject);
    console.log(chalk.green.bold('🌄 Horizon ready for connections'));
  }).catch((err) => {
    console.log(chalk.red.bold(err));
    process.exit(1);
  });
  return hzServer;
};

const change_to_project_dir = (project_path) => {
  if (is_directory(project_path)) {
    process.chdir(project_path);
  } else {
    exit_with_error(`${project_path} is not a directory`);
  }
  if (!is_directory('.hz')) {
    const nicePathName = project_path === '.' ?
            'this directory' : project_path;
    exit_with_error(`${nicePathName} doesn't contain an .hz directory`);
  }
};

// Actually serve based on the already validated options
const runCommand = (opts, done) => {
  if (opts.debug) {
    logger.level = 'debug';
  } else {
    logger.level = 'warn';
  }

  if (!opts.secure && opts.auth && Array.from(Object.keys(opts.auth)).length > 0) {
    logger.warn('Authentication requires that the server be accessible via HTTPS. ' +
                'Either specify "secure=true" or use a reverse proxy.');
  }

  change_to_project_dir(opts.project_path);

  let httpServers, hzInstance;

  interrupt.on_interrupt((done2) => {
    if (hzInstance) {
      hzInstance.close();
    }
    if (httpServers) {
      httpServers.forEach((serv) => {
        serv.close();
      });
    }
    done2();
  });

  return (
    opts.secure ?
      create_secure_servers(opts) : create_insecure_servers(opts)
  ).then((servers) => {
    httpServers = servers;
    if (opts.start_rethinkdb) {
      return start_rdb_server().then((rdbOpts) => {
        // Don't need to check for host, always localhost.
        opts.rdb_host = 'localhost';
        opts.rdb_port = rdbOpts.driverPort;
        console.log('RethinkDB');
        console.log(`   ├── Admin interface: http://localhost:${rdbOpts.httpPort}`);
        console.log(`   └── Drivers can connect to port ${rdbOpts.driverPort}`);
      });
    }
  }).then(() => {
    // Ensure schema from schema.toml file is set
    if (opts.schema_file) {
      console.log(`Ensuring schema "${opts.schema_file}" is applied`);
      const schemaOptions = schema.processApplyConfig({
        project_name: opts.project_name,
        schema_file: opts.schema_file,
        start_rethinkdb: false,
        connect: `${opts.rdb_host}:${opts.rdb_port}`,
        update: true,
        force: false,
      });
      return schema.runApplyCommand(schemaOptions, false, (err) => { console.error(err); });
    }
  }).then(() => {
    hzInstance = startHorizonServer(httpServers, opts);
  }).then(() => {
    if (opts.auth) {
      for (const name in opts.auth) {
        const provider = horizon_server.auth[name];
        if (!provider) {
          throw new Error(`Unrecognized auth provider "${name}"`);
        }
        hzInstance.add_auth_provider(provider,
                                      Object.assign({}, { path: name }, opts.auth[name]));
      }
    }
  }).then(() => {
    // Automatically open up index.html in the `dist` directory only if
    //  `--open` flag specified and an index.html exists in the directory.
    if (opts.open && opts.serve_static) {
      try {
        // Check if index.html exists and readable in serve static_static directory
        fs.accessSync(`${opts.serve_static}/index.html`, fs.R_OK | fs.F_OK);
        // Determine scheme from options
        const scheme = opts.secure ? 'https://' : 'http://';
        // Open up index.html in default browser
        console.log('Attempting open of index.html in default browser');
        open(`${scheme}${opts.bind}:${opts.port}/index.html`);
      } catch (open_err) {
        console.log(chalk.red('Error occurred while trying to open ' +
                              `${opts.serve_static}/index.html`));
        console.log(open_err);
      }
    }
  }).catch(done);
};

serve.addArguments = addArguments;
serve.processConfig = processConfig;
serve.runCommand = runCommand;
serve.helpText = helpText;
serve.merge_configs = merge_configs;
serve.make_default_config = make_default_config;
serve.read_config_from_config_file = read_config_from_config_file;
serve.read_config_from_secrets_file = read_config_from_secrets_file;
serve.read_config_from_env = read_config_from_env;
serve.read_config_from_flags = read_config_from_flags;
serve.change_to_project_dir = change_to_project_dir;
