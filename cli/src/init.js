/* global require, module */

'use strict';

const fs = require('fs');
const crypto = require('crypto');
const process = require('process');
const checkProjectName = require('./utils/check-project-name');
const rethrow = require('./utils/rethrow');

const helpText = 'Initialize a horizon app directory';

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
# secure = false
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
# auto_create_collection = true
# auto_create_index = true


###############################################################################
# RethinkDB Options
# These options are mutually exclusive
# 'connect' will connect to an existing RethinkDB instance
# 'start_rethinkdb' will run an internal RethinkDB instance
#------------------------------------------------------------------------------
# connect = "localhost:28015"
# start_rethinkdb = false


###############################################################################
# Debug Options
# 'debug' enables debug log statements
#------------------------------------------------------------------------------
# debug = true


###############################################################################
# Authentication Options
# Each auth subsection will add an endpoint for authenticating through the
# specified provider.
# 'token_secret' is the key used to sign jwts
# 'allow_anonymous' issues new accounts to users without an auth provider
# 'allow_unauthenticated' allows connections that are not tied to a user id
# 'auth_redirect' specifies where users will be redirected to after login
#------------------------------------------------------------------------------
token_secret = "${crypto.randomBytes(64).toString('base64')}"
# allow_anonymous = true
# allow_unauthenticated = true
# auth_redirect = "/"
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
`;

const addArguments = (parser) => {
  parser.addArgument([ 'projectName' ],
    { action: 'store',
      help: 'Name of directory to create. Defaults to current directory',
      nargs: '?',
    }
  );
};

const fileExists = (pathName) => {
  try {
    fs.statSync(pathName);
    return true;
  } catch (e) {
    return false;
  }
};

const processConfig = (parsed) => parsed;

function maybeMakeDir(createDir, dirName) {
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
}

function maybeChdir(chdirTo) {
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
}

function populateDir(projectName, dirWasPopulated, chdirTo, dirName) {
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
  if (!fileExists('.hz/config.toml')) {
    fs.appendFileSync(
      '.hz/config.toml',
      makeDefaultConfig(projectName),
      {
        encoding: 'utf8',
        mode: 0o600, // Secrets are put in this config, so set it user
        // read/write only
      }
    );
    console.info(`Created ${niceDir}.hz/config.toml`);
  } else {
    console.info('.hz/config.toml already exists, not touching it.');
  }
}

const runCommand = (parsed) => {
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
};


module.exports = {
  addArguments,
  runCommand,
  processConfig,
  helpText,
};
