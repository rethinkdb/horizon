'use strict';

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const makeIndexHTML = (projectName) => `\
<!doctype html>
<html>
  <head>
    <meta charset="UTF-8">
    <script src="/horizon/horizon.js"></script>
    <script>
      var horizon = Horizon();
      horizon.onConnected(function() {
        document.querySelector('h1').innerHTML = '${projectName} works!'
      });
      horizon.connect();
    </script>
  </head>
  <body>
   <marquee><h1></h1></marquee>
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
# 'insecure' will disable HTTPS and use HTTP instead
# 'key_file' and 'cert_file' are required for serving HTTPS
#------------------------------------------------------------------------------
# insecure = true
# key_file = "key.pem"
# cert_file = "cert.pem"


###############################################################################
# App Options
# 'project' will change to the given directory
# 'serve_static' will serve files from the given directory over HTTP/HTTPS
#------------------------------------------------------------------------------
project = "${projectName}"
# serve_static = "dist"


###############################################################################
# Data Options
# WARNING: these should probably not be enabled on a publically accessible
# service.  Tables and indexes are not lightweight objects, and allowing them
# to be created like this could open the service up to denial-of-service
# attacks.
# 'auto_create_table' creates a table when one is needed but does not exist
# 'auto_create_index' creates an index when one is needed but does not exist
#------------------------------------------------------------------------------
# auto_create_table = true
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

const fileDoesntExist = (pathName) => {
  try {
    fs.statSync(pathName);
    console.error(`Bailing! ${pathName} already exists`);
    process.exit(1);
  } catch (e) {
    return true;
  }
};

const processConfig = (parsed) => parsed;

const runCommand = (parsed) => {
  if (parsed.projectName != null && fileDoesntExist(parsed.projectName)) {
    fs.mkdirSync(parsed.projectName);
    console.info(`Created new project directory ${parsed.projectName}`);
    process.chdir(parsed.projectName);
  } else {
    parsed.projectName = path.basename(process.cwd());
    console.info('Creating new project in current directory');
  }

  if (fileDoesntExist('src')) {
    fs.mkdirSync('src');
  }
  if (fileDoesntExist('dist')) {
    fs.mkdirSync('dist');
    fs.appendFileSync('./dist/index.html', makeIndexHTML(parsed.projectName));
  }
  if (fileDoesntExist('.hz')) {
    fs.mkdirSync('.hz');
  }
  if (fileDoesntExist('.hz/config.toml')) {
    fs.appendFileSync('.hz/config.toml', makeDefaultConfig(parsed.projectName), {
      encoding: 'utf8',
      mode: 0o600, // Secrets are put in this config, so set it user
                   // read/write only
    });
  }
};


module.exports = {
  addArguments,
  runCommand,
  processConfig,
};
