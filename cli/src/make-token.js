'use strict';

const interrupt = require('./utils/interrupt');
const start_rdb_server = require('./utils/start_rdb_server');
const serve = require('./serve');
const logger = require('@horizon/server').logger;

const path = require('path');
const jwt = require('jsonwebtoken');
const r = require('rethinkdb');

const helpText = 'Generate a token to log in as a user';

const addArguments = (parser) => {
  parser.addArgument([ 'project_path' ],
    { type: 'string', nargs: '?',
      help: 'Change to this directory before serving' });

  parser.addArgument([ '--project-name', '-n' ],
    { type: 'string', action: 'store', metavar: 'NAME',
      help: 'Name of the Horizon Project server' });

  parser.addArgument([ '--connect', '-c' ],
    { type: 'string', metavar: 'HOST:PORT',
      help: 'Host and port of the RethinkDB server to connect to.' });

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
};

const processConfig = (parsed) => {
  let config;

  config = serve.make_default_config();
  config.start_rethinkdb = true;

  config = serve.merge_configs(config, serve.read_config_from_file(parsed.project_path,
                                                                   parsed.config));
  config = serve.merge_configs(config, serve.read_config_from_env());
  config = serve.merge_configs(config, serve.read_config_from_flags(parsed));

  if (config.project_name === null) {
    config.project_name = path.basename(path.resolve(config.project_path));
  }

  return Object.assign(config, { user: parsed.user });
};

const runCommand = (options, done) => {
  const db = options.project_name;
  const internal_db = `${db}_internal`;
  let conn;

  if (options.token_secret === null) {
    done(new Error('No token secret specified, unable to sign the token.'));
  }

  logger.level = 'error';
  interrupt.on_interrupt((done2) => {
    if (conn) {
      conn.close();
    }
    done2();
  });

  if (options.start_rethinkdb) {
    serve.change_to_project_dir(options.project_path);
  }

  return new Promise((resolve) => {
    resolve(options.start_rethinkdb &&
            start_rdb_server().then((rdbOpts) => {
              options.rdb_host = 'localhost';
              options.rdb_port = rdbOpts.driverPort;
            }));
  }).then(() =>
    r.connect({ host: options.rdb_host,
                port: options.rdb_port })
  ).then((rdb_conn) => {
    conn = rdb_conn;
    return r.db(internal_db).table('users')
      .wait({ waitFor: 'ready_for_reads', timeout: 30 })
      .run(conn);
  }).then(() =>
    r.db(internal_db).table('users').get(options.user).run(conn)
  ).then((res) => {
    conn.close();

    if (res === null) {
      throw new Error('User does not exist.');
    }

    const token = jwt.sign({ id: res.id, provider: null },
                           new Buffer(options.token_secret, 'base64'),
                           { expiresIn: '1d', algorithm: 'HS512' });
    console.log(`${token}`);
  }).then(() => interrupt.shutdown()).catch(done);
};

module.exports = {
  addArguments,
  processConfig,
  runCommand,
  helpText,
};
