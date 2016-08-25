'use strict';

const interrupt = require('./utils/interrupt');
const config = require('./utils/config');
const horizon_server = require('@horizon/server');

const path = require('path');
const jwt = require('jsonwebtoken');

const r = horizon_server.r;
const logger = horizon_server.logger;
const argparse = require('argparse');

const parseArguments = (args) => {
  const parser = new argparse.ArgumentParser({ prog: 'hz make-token' });

  parser.addArgument(
    [ '--token-secret' ],
    { type: 'string', metavar: 'SECRET',
      help: 'Secret key for signing the token.' });

  parser.addArgument(
    [ 'user' ],
    { type: 'string', metavar: 'USER_ID',
      help: 'The ID of the user to issue a token for.' });

  return parser.parseArgs(args);
};

const processConfig = (parsed) => {
  let options;

  options = config.default_options();

  options = config.merge_options(
    options, config.read_from_config_file(parsed.project_path));
  options = config.merge_options(
    options, config.read_from_secrets_file(parsed.project_path));
  options = config.merge_options(options, config.read_from_env());
  options = config.merge_options(options, config.read_from_flags(parsed));

  if (options.project_name === null) {
    options.project_name = path.basename(path.resolve(options.project_path));
  }

  return Object.assign(options, { user: parsed.user });
};

const run = (args) => Promise.resolve().then(() => {
  const options = processConfig(parseArguments(args));

  if (options.token_secret === null) {
    throw new Error('No token secret specified, unable to sign the token.');
  }
  const token = jwt.sign(
    { id: options.user, provider: null },
    new Buffer(options.token_secret, 'base64'),
    { expiresIn: '1d', algorithm: 'HS512' }
  );
  console.log(`${token}`);
});

module.exports = {
  run,
  description: 'Generate a token to log in as a user',
};
