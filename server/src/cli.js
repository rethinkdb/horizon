'use strict';

const fusion = require('../');
const fs = require('fs');
const argparse = require('argparse');
const path = require('path');
const cli = {};

const stringToBoolean = (string) => {
  switch (string.toLowerCase().trim()) {
  case 'true': return true;
  case 'false': return false;
  default: return Boolean(string);
  }
};

cli.cli_parser = () => {
  const parser = new argparse.ArgumentParser({
    addHelp: true,
    description: 'Fusion Server',
  });

  parser.addArgument([ '--bind', '-b' ], {
    type: 'string',
    action: 'append',
    metavar: 'HOST',
    help: 'Local hostname to serve fusion on (repeatable).',
  });

  parser.addArgument([ '--port', '-p' ], {
    type: 'int',
    defaultValue: 8181,
    metavar: 'PORT',
    help: 'Local port to serve fusion on.',
  });

  parser.addArgument([ '--connect', '-c' ], {
    type: 'string',
    metavar: 'HOST:PORT',
    help: 'Host and port of the RethinkDB server to connect to.',
  });

  parser.addArgument([ '--key-file' ], {
    type: 'string',
    metavar: 'PATH',
    help: 'Path to the key file to use, defaults to "./key.pem".',
  });

  parser.addArgument([ '--cert-file' ], {
    type: 'string',
    metavar: 'PATH',
    help: 'Path to the cert file to use, defaults to "./cert.pem".',
  });
  parser.addArgument([ '--debug' ], {
    action: 'storeTrue',
    help: 'Enable debug logging.',
  });

  parser.addArgument([ '--insecure' ], {
    action: 'storeTrue',
    help: 'Serve insecure websockets, ignore --key-file and --cert-file.',
  });

  parser.addArgument([ '--auto-create-table' ], {
    action: 'storeTrue',
    help: 'Create tables used by requests if they do not exist.',
  });

  parser.addArgument([ '--auto-create-index' ], {
    action: 'storeTrue',
    help: 'Create indexes used by requests if they do not exist.',
  });

  parser.addArgument([ '--dev' ], {
    action: 'storeTrue',
    help: 'Runs the server in development mode, this sets --debug, --insecure, --auto-create-tables, and --auto-create-indexes.',
  });

  parser.addArgument([ '--config' ], {
    type: 'string',
    metavar: 'PATH',
    help: 'Sets server configuration using the config file at the specified path',
  });

  return parser;
};

// If config file path given, check if valid file/path. Since
//  `require` is being used here. Looking before leaping here,
//  rather than using fs.open and reporting back error.
//  Then apply config file settings to running config.
cli.read_from_config_file = (config, parsed) => {
  // Catch if there's no config file set at all.
  if (!parsed.config) {
    return {};
  }

  // First check if permissions allow us to read file.
  try {
    fs.accessSync(parsed.config, fs.R_OK);
  } catch (err) {
    fusion.logger.error('Unable to access file, check file permissions.');
    fusion.logger.error(err);
    process.exit(1);
  }

  // Check if file is actually a file.
  try {
    const stat = fs.statSync(parsed.config);
    if (!stat.isFile()) {
      fusion.logger.error('Config path is not a file.');
      process.exit(1);
    }
  } catch (err) {
    fusion.logger.error('Error occurred while retrieving config file stats.');
    fusion.logger.error(err);
    process.exit(1);
  }

  // Read and import file, flags receive precedence over
  //  config file settings.
  let file_config;
  if (parsed.config.endsWith('.js')) {
    file_config = require(path.resolve(parsed.config.slice(0, -3)));
  } else {
    file_config = require(parsed.config);
  }

  // Apply all config file properties onto current config.
  return Object.assign(config, file_config);
};

cli.read_from_env_vars = (config) => {
  const env_vars = {};

  // Match FUSION_ and an unlimtied number of capital words
  //  separated by underscores.
  const regex = /^FUSION\_{1}[[A-Z]+([\_]?[A-Z])*$/;
  for (let prop in process.env) {
    if (regex.test(prop)) {
      try {
        // Remove "FUSION_" from the environment variable
        const varName = prop.toLowerCase().split('_').slice(1).join('_');

        // Check if value is boolean since they are stringified
        //  in environment vars.
        if (([ 'false', 'true' ].indexOf(process.env[prop].toLowerCase()) > -1)) {
          env_vars[varName] = stringToBoolean(process.env[prop]);

        // Check if name is port and convert to int
        } else if (varName === 'port') {
          env_vars[varName] = parseInt(process.env[prop]);

        // Else just assign
        } else {
          env_vars[varName] = process.env[prop];
        }
      } catch (err) {
        fusion.logger.error('Error occurred while parsing env variables.\n', err);
        process.exit(1);
      }
    }
  }
  return Object.assign(config, env_vars);
};

cli.read_from_flags = (config, parsed) => {
  for (let prop in parsed) {
    // Ensure isn't some inherited property non-sense and !undefined && !null
    if (parsed.hasOwnProperty(prop) && typeof parsed[prop] !== 'undefined' && parsed[prop] !== null) {
      config[prop] = parsed[prop];
    }
  }
  return config;
};

module.exports = cli;
