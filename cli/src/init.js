/* global require, module */

'use strict';

const fs = require('fs');
const crypto = require('crypto');
const process = require('process');
const argparse = require('argparse');
const checkProjectName = require('./utils/check-project-name');
const rethrow = require('./utils/rethrow');

const makeIndexHTML = (projectName) => `\
<!doctype html>
<html>
  <head>
    <meta charset="UTF-8">
    <script src="/horizon/horizon.js"></script>
    <script>
      var horizon = Horizon();
      horizon.onReady(function() {
        document.querySelector('h1').innerHTML = '${projectName} works!'
      });
      horizon.connect();
    </script>
  </head>
  <body>
   <marquee direction="left"><h1></h1></marquee>
  </body>
</html>
`;

const makeDefaultConfig = (projectName) => `\
# This is a TOML file

###############################################################################
# IP options
# 'bind' controls which local interfaces will be listened on
# 'port' controls which port will be listened on
#------------------------------------------------------------------------------
# bind = [ "localhost" ]
# port = 8181


###############################################################################
# HTTPS Options
# 'secure' will disable HTTPS and use HTTP instead when set to 'false'
# 'key_file' and 'cert_file' are required for serving HTTPS
#------------------------------------------------------------------------------
# secure = true
# key_file = "horizon-key.pem"
# cert_file = "horizon-cert.pem"


###############################################################################
# App Options
# 'project_name' sets the name of the RethinkDB database used to store the
#                application state
# 'serve_static' will serve files from the given directory over HTTP/HTTPS
#------------------------------------------------------------------------------
project_name = "${projectName}"
# serve_static = "dist"


###############################################################################
# Data Options
# WARNING: these should probably not be enabled on a publically accessible
# service.  Tables and indexes are not lightweight objects, and allowing them
# to be created like this could open the service up to denial-of-service
# attacks.
# 'auto_create_collection' creates a collection when one is needed but does not exist
# 'auto_create_index' creates an index when one is needed but does not exist
#------------------------------------------------------------------------------
# auto_create_collection = false
# auto_create_index = false


###############################################################################
# RethinkDB Options
# 'connect' and 'start_rethinkdb' are mutually exclusive
# 'connect' will connect to an existing RethinkDB instance
# 'start_rethinkdb' will run an internal RethinkDB instance
# 'rdb_timeout' is the number of seconds to wait when connecting to RethinkDB
#------------------------------------------------------------------------------
# connect = "localhost:28015"
# start_rethinkdb = false
# rdb_timeout = 30


###############################################################################
# Debug Options
# 'debug' enables debug log statements
#------------------------------------------------------------------------------
# debug = false


###############################################################################
# Authentication Options
# Each auth subsection will add an endpoint for authenticating through the
# specified provider.
# 'token_secret' is the key used to sign jwts
# 'allow_anonymous' issues new accounts to users without an auth provider
# 'allow_unauthenticated' allows connections that are not tied to a user id
# 'auth_redirect' specifies where users will be redirected to after login
# 'access_control_allow_origin' sets a host that can access auth settings
#   (typically your frontend host)
#------------------------------------------------------------------------------
# allow_anonymous = false
# allow_unauthenticated = false
# auth_redirect = "/"
# access_control_allow_origin = ""
#
`;

const makeDefaultSchema = () => `\
[groups.admin]
[groups.admin.rules.carte_blanche]
template = "any()"
`;

const makeDefaultSecrets = () => `\
token_secret = "${crypto.randomBytes(64).toString('base64')}"

###############################################################################
# RethinkDB Options
# 'rdb_user' is the user account to log in with when connecting to RethinkDB
# 'rdb_password' is the password for the user account specified by 'rdb_user'
#------------------------------------------------------------------------------
# rdb_user = 'admin'
# rdb_password = ''

# [auth.auth0]
# host = "0000.00.auth0.com"
# id = "0000000000000000000000000"
# secret = "00000000000000000000000000000000000000000000000000"
#
# [auth.facebook]
# id = "000000000000000"
# secret = "00000000000000000000000000000000"
#
# [auth.google]
# id = "00000000000-00000000000000000000000000000000.apps.googleusercontent.com"
# secret = "000000000000000000000000"
#
# [auth.twitter]
# id = "0000000000000000000000000"
# secret = "00000000000000000000000000000000000000000000000000"
#
# [auth.github]
# id = "00000000000000000000"
# secret = "0000000000000000000000000000000000000000"
#
# [auth.twitch]
# id = "0000000000000000000000000000000"
# secret = "0000000000000000000000000000000"
#
# [auth.slack]
# id = "0000000000000000000000000000000"
# secret = "0000000000000000000000000000000"
`;

const gitignore = () => `\
rethinkdb_data
**/*.log
.hz/secrets.toml
node_modules
`;

const parseArguments = (args) => {
  const parser = new argparse.ArgumentParser({ prog: 'hz init' });
  parser.addArgument([ 'projectName' ],
    { action: 'store',
      help: 'Name of directory to create. Defaults to current directory',
      nargs: '?',
    }
  );
  return parser.parseArgs(args);
};

const fileExists = (pathName) => {
  try {
    fs.statSync(pathName);
    return true;
  } catch (e) {
    return false;
  }
};

const maybeMakeDir = (createDir, dirName) => {
  if (createDir) {
    try {
      fs.mkdirSync(dirName);
      console.info(`Created new project directory ${dirName}`);
    } catch (e) {
      throw rethrow(e,
        `Couldn't make directory ${dirName}: ${e.message}`);
    }
  } else {
    console.info(`Initializing in existing directory ${dirName}`);
  }
};

const maybeChdir = (chdirTo) => {
  if (chdirTo) {
    try {
      process.chdir(chdirTo);
    } catch (e) {
      if (e.code === 'ENOTDIR') {
        throw rethrow(e, `${chdirTo} is not a directory`);
      } else {
        throw rethrow(e, `Couldn't chdir to ${chdirTo}: ${e.message}`);
      }
    }
  }
};

const populateDir = (projectName, dirWasPopulated, chdirTo, dirName) => {
  const niceDir = chdirTo ? `${dirName}/` : '';
  if (!dirWasPopulated && !fileExists('src')) {
    fs.mkdirSync('src');
    console.info(`Created ${niceDir}src directory`);
  }
  if (!dirWasPopulated && !fileExists('dist')) {
    fs.mkdirSync('dist');
    console.info(`Created ${niceDir}dist directory`);

    fs.appendFileSync('./dist/index.html', makeIndexHTML(projectName));
    console.info(`Created ${niceDir}dist/index.html example`);
  }

  if (!fileExists('.hz')) {
    fs.mkdirSync('.hz');
    console.info(`Created ${niceDir}.hz directory`);
  }

  // Default permissions
  const permissionGeneral = {
    encoding: 'utf8',
    mode: 0o666,
  };

  const permissionSecret = {
    encoding: 'utf8',
    mode: 0o600, // Secrets are put in this config, so set it user, read/write only
  };

  // Create .gitignore if it doesn't exist
  if (!fileExists('.gitignore')) {
    fs.appendFileSync(
      '.gitignore',
      gitignore(),
      permissionGeneral
    );
    console.info(`Created ${niceDir}.gitignore`);
  } else {
    console.info('.gitignore already exists, not touching it.');
  }

  // Create .hz/config.toml if it doesn't exist
  if (!fileExists('.hz/config.toml')) {
    fs.appendFileSync(
      '.hz/config.toml',
      makeDefaultConfig(projectName),
      permissionGeneral
    );
    console.info(`Created ${niceDir}.hz/config.toml`);
  } else {
    console.info('.hz/config.toml already exists, not touching it.');
  }

  // Create .hz/schema.toml if it doesn't exist
  if (!fileExists('.hz/schema.toml')) {
    fs.appendFileSync(
      '.hz/schema.toml',
      makeDefaultSchema(),
      permissionGeneral
    );
    console.info(`Created ${niceDir}.hz/schema.toml`);
  } else {
    console.info('.hz/schema.toml already exists, not touching it.');
  }

  // Create .hz/secrets.toml if it doesn't exist
  if (!fileExists('.hz/secrets.toml')) {
    fs.appendFileSync(
      '.hz/secrets.toml',
      makeDefaultSecrets(),
      permissionSecret
    );
    console.info(`Created ${niceDir}.hz/secrets.toml`);
  } else {
    console.info('.hz/secrets.toml already exists, not touching it.');
  }
};

const run = (args) =>
  Promise.resolve(args)
    .then(parseArguments)
    .then((parsed) => {
      const check = checkProjectName(
        parsed.projectName,
        process.cwd(),
        fs.readdirSync('.')
      );
      const projectName = check.projectName;
      const dirName = check.dirName;
      const chdirTo = check.chdirTo;
      const createDir = check.createDir;
      maybeMakeDir(createDir, dirName);
      maybeChdir(chdirTo);

      // Before we create things, check if the directory is empty
      const dirWasPopulated = fs.readdirSync(process.cwd()).length !== 0;
      populateDir(projectName, dirWasPopulated, chdirTo, dirName);
    });

module.exports = {
  run,
  description: 'Initialize a horizon app directory',
};
