'use strict';

const interrupt = require('./utils/interrupt');
const start_rdb_server = require('./utils/start_rdb_server');
const change_to_project_dir = require('./utils/change_to_project_dir');
const config = require('./utils/config');
const horizon_server = require('@horizon/server');

const path = require('path');
const jwt = require('jsonwebtoken');

const r = horizon_server.r;
const logger = horizon_server.logger;
const argparse = require('argparse');

const parseArguments = (args) => {
  const parser = new argparse.ArgumentParser({ prog: 'hz make-token' });

  parser.addArgument([ 'project_path' ],
    { type: 'string', nargs: '?',
      help: 'Change to this directory before serving' });

  parser.addArgument([ '--project-name', '-n' ],
    { type: 'string', action: 'store', metavar: 'NAME',
      help: 'Name of the Horizon Project server' });

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

  parser.addArgument([ '--start-rethinkdb' ],
    { type: 'string', metavar: 'yes|no', constant: 'yes', nargs: '?',
      help: 'Start up a RethinkDB server in the current directory' });

  parser.addArgument([ '--config' ],
    { type: 'string', metavar: 'PATH',
      help: 'Path to the config file to use, defaults to ".hz/config.toml".' });

  parser.addArgument([ '--debug' ],
    { type: 'string', metavar: 'yes|no', constant: 'yes', nargs: '?',
      help: 'Enable debug logging.' });

  parser.addArgument([ '--token-secret' ],
    { type: 'string', metavar: 'SECRET',
      help: 'Secret key for signing the token.' });

  parser.addArgument([ 'user' ],
    { type: 'string', metavar: 'USER_ID',
      help: 'The ID of the user to issue a token for.' });

  return parser.parseArgs(args);
};

const processConfig = (parsed) => {
  let options;

  options = config.default_options();
  options.start_rethinkdb = true;

  options = config.merge_options(options,
    config.read_from_config_file(parsed.project_path, parsed.config));
  options = config.merge_options(options,
    config.read_from_secrets_file(parsed.project_path, parsed.config));
  options = config.merge_options(options, config.read_from_env());
  options = config.merge_options(options, config.read_from_flags(parsed));

  if (options.project_name === null) {
    options.project_name = path.basename(path.resolve(options.project_path));
  }

  return Object.assign(options, { user: parsed.user });
};

const run = (args) => {
  let db, options, conn, rdb_server;
  const old_log_level = logger.level;

  const cleanup = () => {
    logger.level = old_log_level;

    return Promise.all([
      conn ? conn.close() : Promise.resolve(),
      rdb_server ? rdb_server.close() : Promise.resolve(),
    ]);
  };

  interrupt.on_interrupt(() => cleanup());

  return Promise.resolve().then(() => {
    options = processConfig(parseArguments(args));
    db = options.project_name;
    logger.level = 'error';

    if (options.token_secret === null) {
      throw new Error('No token secret specified, unable to sign the token.');
    }

    if (options.start_rethinkdb) {
      change_to_project_dir(options.project_path);

      return start_rdb_server().then((server) => {
        rdb_server = server;
        options.rdb_host = 'localhost';
        options.rdb_port = server.driver_port;
      });
    }
  }).then(() =>
    r.connect({ host: options.rdb_host,
                port: options.rdb_port,
                user: options.rdb_user,
                password: options.rdb_password,
                timeout: options.rdb_timeout })
  ).then((rdb_conn) => {
    conn = rdb_conn;

    return r.db(db).table('users')
      .wait({ waitFor: 'ready_for_reads', timeout: 30 })
      .run(conn);
  }).then(() =>
    r.db(db).table('users').get(options.user).run(conn)
  ).then((res) => {
    if (res === null) {
      throw new Error('User does not exist.');
    }

    const token = jwt.sign({ id: res.id, provider: null },
                           new Buffer(options.token_secret, 'base64'),
                           { expiresIn: '1d', algorithm: 'HS512' });
    console.log(`${token}`);
  }).then(cleanup).catch((err) => cleanup().then(() => { throw err; }));
};

module.exports = {
  run,
  description: 'Generate a token to log in as a user',
};
