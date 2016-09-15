'use strict';

const chalk = require('chalk');
const crypto = require('crypto');
const fs = require('fs');
const get_type = require('mime-types').contentType;
const http = require('http');
const https = require('https');
const open = require('open');
const path = require('path');
const argparse = require('argparse');
const url = require('url');

const config = require('./utils/config');
const start_rdb_server = require('./utils/start_rdb_server');
const change_to_project_dir = require('./utils/change_to_project_dir');
const NiceError = require('./utils/nice_error.js');
const interrupt = require('./utils/interrupt');
const schema = require('./schema');

const horizon_server = require('@horizon/server');
const logger = horizon_server.logger;

const TIMEOUT_30_SECONDS = 30 * 1000;

const default_rdb_host = 'localhost';
const default_rdb_port = 28015;
const default_rdb_timeout = 20;

const parseArguments = (args) => {
  const parser = new argparse.ArgumentParser({ prog: 'hz serve' });

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
      help: 'Key for signing jwts' });

  parser.addArgument([ '--allow-unauthenticated' ],
    { type: 'string', metavar: 'yes|no', constant: 'yes', nargs: '?',
      help: 'Whether to allow unauthenticated Horizon connections.' });

  parser.addArgument([ '--allow-anonymous' ],
    { type: 'string', metavar: 'yes|no', constant: 'yes', nargs: '?',
      help: 'Whether to allow anonymous Horizon connections.' });

  parser.addArgument([ '--max-connections' ],
    { type: 'int', metavar: 'MAX_CONNECTIONS',
      help: 'Maximum number of simultaneous connections server will accept.' });

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
      '--allow-anonymous=yes ' +
      'and --serve-static=./dist.' });

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

  return parser.parseArgs(args);
};

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
        } else if (stats.isDirectory()) {
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
  const servers = [ ];
  let numReady = 0;
  return new Promise((resolve, reject) => {
    opts.bind.forEach((host) => {
      const srv = ctor().listen(opts.port, host);
      servers.push(srv);
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
        if (++numReady === servers.length) {
          resolve(servers);
        }
      });
      srv.on('error', (err) => {
        reject(new Error(`HTTP${opts.secure ? 'S' : ''} server: ${err}`));
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

const read_cert_file = (file, type) => {
  try {
    return fs.readFileSync(path.resolve(file));
  } catch (err) {
    const wasDefault = file.endsWith(`horizon-${type}.pem`);
    let description;
    const suggestions = [
      `If you're running horizon for the first time, we recommend \
running horizon like ${chalk.white('hz serve --dev')} to get started without \
having to configure certificates.`,
    ];
    if (wasDefault) {
      suggestions.push(
        `If you have a ${type} file you'd like to use but they aren't in the \
default location, pass them in with the \
${chalk.white(`hz serve --${type}-file`)} option.`,
        `You can explicitly disable security by passing \
${chalk.white('--secure=no')} to ${chalk.white('hz serve')}.`,
        `You can generate a cert and key file for development by using the \
${chalk.white('hz create-cert')} command. Note that these certs won't be \
signed by a certificate authority, so you will need to explicitly authorize \
them in your browser.`
      );
      description = `In order to run the server in secure mode (the default), \
Horizon needs both a certificate file and a key file to encrypt websockets. \
By default, it looks for horizon-key.pem and horizon-cert.pem \
files in the current directory.`;
    } else {
      // They supplied a cert or key file, so don't give the long
      // explanation and irrelevant suggestions.
      suggestions.unshift(`See if the ${type} filename was misspelled.`);
      description = null;
    }
    throw new NiceError(
      `Could not access the ${type} file ${file}`, {
        description,
        suggestions,
      });
  }
};

const create_secure_servers = (opts) => {
  const cert = read_cert_file(opts.cert_file, 'cert');
  const key = read_cert_file(opts.key_file, 'key');
  return initialize_servers(() => new https.Server({ key, cert }), opts);
};

// Command-line flags have the highest precedence, followed by environment variables,
// then the config file, and finally the default values.
const processConfig = (parsed) => {
  let options;

  options = config.default_options();

  options = config.merge_options(options,
    config.read_from_config_file(parsed.project_path));

  options = config.merge_options(options,
    config.read_from_secrets_file(parsed.project_path));

  options = config.merge_options(options, config.read_from_env());

  options = config.merge_options(options, config.read_from_flags(parsed));

  if (options.project_name === null) {
    options.project_name = path.basename(path.resolve(options.project_path));
  }

  if (options.bind.indexOf('all') !== -1) {
    options.bind = [ '0.0.0.0' ];
  }

  if (!options.rdb_host) {
    options.rdb_host = default_rdb_host;
  }

  if (!options.rdb_port) {
    options.rdb_port = default_rdb_port;
  }

  if (!options.rdb_timeout) {
    options.rdb_timeout = default_rdb_timeout;
  }

  return options;
};

const start_horizon_server = (http_servers, opts) =>
  new horizon_server.Server(http_servers, {
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
    max_connections: opts.max_connections || null,
  });

// `interruptor` is meant for use by tests to stop the server without relying on SIGINT
const run = (args, interruptor) => {
  let opts, http_servers, hz_server, rdb_server;
  const old_log_level = logger.level;

  const cleanup = () => {
    logger.level = old_log_level;

    return Promise.all([
      hz_server ? hz_server.close() : Promise.resolve(),
      rdb_server ? rdb_server.close() : Promise.resolve(),
      http_servers ? Promise.all(http_servers.map((s) =>
        new Promise((resolve) => s.close(resolve)))) : Promise.resolve(),
    ]);
  };

  interrupt.on_interrupt(() => cleanup());

  return Promise.resolve().then(() => {
    opts = processConfig(parseArguments(args));
    logger.level = opts.debug ? 'debug' : 'warn';

    if (!opts.secure && opts.auth && Array.from(Object.keys(opts.auth)).length > 0) {
      logger.warn('Authentication requires that the server be accessible via HTTPS. ' +
                  'Either specify "secure=true" or use a reverse proxy.');
    }

    change_to_project_dir(opts.project_path);

    if (opts.secure) {
      return create_secure_servers(opts);
    } else {
      return create_insecure_servers(opts);
    }
  }).then((servers) => {
    http_servers = servers;

    if (opts.start_rethinkdb) {
      return start_rdb_server().then((server) => {
        rdb_server = server;

        // Don't need to check for host, always localhost.
        opts.rdb_host = 'localhost';
        opts.rdb_port = server.driver_port;

        console.log('RethinkDB');
        console.log(`   ├── Admin interface: http://localhost:${server.http_port}`);
        console.log(`   └── Drivers can connect to port ${server.driver_port}`);
      });
    }
  }).then(() => {
    // Ensure schema from schema.toml file is set
    if (opts.schema_file) {
      console.log(`Ensuring schema "${opts.schema_file}" is applied`);
      try {
        fs.accessAsync(opts.schema_file, fs.R_OK | fs.F_OK);
      } catch (e) {
        console.error(
          chalk.yellow.bold('No .hz/schema.toml file found'));
        return;
      }
      const schemaOptions = schema.processApplyConfig({
        project_name: opts.project_name,
        schema_file: opts.schema_file,
        start_rethinkdb: false,
        connect: `${opts.rdb_host}:${opts.rdb_port}`,
        update: true,
        force: false,
      });
      return schema.runApplyCommand(schemaOptions);
    }
  }).then(() => {
    console.log('Starting Horizon...');
    hz_server = start_horizon_server(http_servers, opts);

    return new Promise((resolve, reject) => {
      const timeoutObject = setTimeout(() => {
        reject(new Error('Horizon failed to start after 30 seconds.\n' +
                         'Try running hz serve again with the --debug flag'));
      }, TIMEOUT_30_SECONDS);

      hz_server.ready().then(() => {
        clearTimeout(timeoutObject);
        console.log(chalk.green.bold('🌄 Horizon ready for connections'));
        resolve(hz_server);
      }).catch(reject);
    });
  }).then(() => {
    if (opts.auth) {
      for (const name in opts.auth) {
        const provider = horizon_server.auth[name];
        if (!provider) {
          throw new Error(`Unrecognized auth provider "${name}"`);
        }
        hz_server.add_auth_provider(provider,
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

    return Promise.race([
      hz_server._interruptor.catch(() => { }),
      interruptor ? interruptor.catch(() => { }) : new Promise(() => { }),
    ]);
  }).then(cleanup).catch((err) => cleanup().then(() => { throw err; }));
};

module.exports = {
  run,
  description: 'Serve a Horizon app',
  parseArguments,
  processConfig,
};
