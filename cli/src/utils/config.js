'use strict';

const parse_yes_no_option = require('./parse_yes_no_option');

const fs = require('fs');
const url = require('url');

const toml = require('toml');

const default_config_file = '.hz/config.toml';
const default_secrets_file = '.hz/secrets.toml';
const default_rdb_port = 28015;

const make_default_options = () => ({
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

const default_options = make_default_options();

const yes_no_options = [ 'debug',
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

const read_from_config_file = (project_path, config_file) => {
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
    } else if (yes_no_options.indexOf(field) !== -1) {
      config[field] = parse_yes_no_option(fileConfig[field], field);
    } else if (default_options[field] !== undefined) {
      config[field] = fileConfig[field];
    } else {
      throw new Error(`Unknown config parameter: "${field}".`);
    }
  }
  return config;
};

const read_from_secrets_file = (projectPath, secretsFile) => {
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
    } else if (yes_no_options.indexOf(field) !== -1) {
      config[field] = parse_yes_no_option(fileConfig[field], field);
    } else if (default_options[field] !== undefined) {
      config[field] = fileConfig[field];
    } else {
      throw new Error(`Unknown config parameter: "${field}".`);
    }
  }

  return config;
};

const env_regex = /^HZ_([A-Z]+([_]?[A-Z]+)*)$/;
const read_from_env = () => {
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
      } else if (yes_no_options.indexOf(destVarName) !== -1) {
        config[destVarName] = parse_yes_no_option(value, destVarName);
      } else if (default_options[destVarName] !== undefined) {
        config[destVarName] = value;
      }
    }
  }

  return config;
};

// Handles reading configuration from the parsed flags
//  NOTE: New flags must be manually added here or they will not apply correctly
const read_from_flags = (parsed) => {
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
  yes_no_options.forEach((key) => {
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

const merge_options = (old_options, new_options) => {
  // Disable start_rethinkdb if it was enabled by dev mode but we already have a host
  if (new_options._start_rethinkdb_implicit) {
    if (old_options.rdb_host) {
      delete new_options.start_rethinkdb;
    }
  } else if (new_options.start_rethinkdb && new_options.rdb_host) {
    throw new Error('Cannot provide both --start-rethinkdb and --connect.');
  }

  for (const key in new_options) {
    if (key === 'rdb_host') {
      old_options.start_rethinkdb = false;
    }

    if (key === 'auth') {
      for (const provider in new_options.auth) {
        old_options.auth[provider] = old_options.auth[provider] || { };
        for (const field in new_options.auth[provider]) {
          old_options.auth[provider][field] = new_options.auth[provider][field];
        }
      }
    } else {
      old_options[key] = new_options[key];
    }
  }

  return old_options;
};

module.exports = {
  default_config_file,
  default_secrets_file,
  default_options: make_default_options,
  read_from_config_file,
  read_from_secrets_file,
  read_from_env,
  read_from_flags,
  merge_options,
};
