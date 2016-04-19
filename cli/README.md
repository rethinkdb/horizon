# Getting started with the Horizon CLI

To install the hz tool from npm:

```
$ npm install -g horizon
```

For a tutorial learn how to use the cli, see the [getting started guide](/GETTING-STARTED.md).

## Horizon CLI `hz` || `horizon`

### `hz init`
Create a horizon app directory, automatically creating a `src` and `dist`
directories within the folder, as well as a `.hz/config.toml` configuration file.

Positional Args | Description
----------------|------------
projectName |  Name of directory to create. Defaults to current directory

### `hz serve`

This serves the directory and supplies all the tooling needed for serving a
Horizon web application.

*Note:* `hz serve` will be configured by options in the following order of
least to highest precedence:

```
environment variables < config file (`.hz/config.toml`) < command-line flags
```

##### Available options

Positional Args | Description
----------------|------------
project | Change to this directory before serving

Optional Args| Description
------------|----------------------------------
  --bind HOST         | Local hostname to serve Horizon on (repeatable).
  --port PORT         | Local port to serve horizon on. Defaults to `8181`.
  --connect HOST:PORT | Host and port of the RethinkDB server to connect to. Defaults to localhost:28015
  --key-file PATH     | Path to the key file to use, defaults to `./key.pem`.
  --cert-file PATH    | Path to the cert file to use, defaults to `./cert.pem`.
  --allow-unauthenticated | Whether to allow unauthenticated Horizon connections.
  --debug             | Enable debug logging.
  --insecure          | Serve insecure websockets, ignore `--key-file` and `--cert-file`.
  --start-rethinkdb   | Start up a RethinkDB server in the current directory
  --auto-create-table | Create tables used by requests if they do not exist
  --auto-create-index | Create indexes used by requests if they do not exist
  --serve-static [PATH] | Serve static files from a directory. Defaults to `dist`.
  --dev               | Runs the server in development mode, this sets `--insecure`, `--auto-create-tables`, and `--auto-create-indexes`.

#### Serving securely, generating certs for SSL

There are proper ways to get a certificate registered through a Certificate
Authority, but for the purpose of getting up-and-running as soon as possible,
generate a self-signed certificate.  This command will generate the certificate
using the default options from `openssl`, and should not be used for anything
serious:

```sh
openssl req -x509 -newkey rsa:2048 -keyout horizon-key.pem -out horizon-cert.pem -days 365 -nodes -batch
```

Once a key file and cert file have been obtained, launch the server without the `--insecure`
flag, and provide the files in the `--key-file` and `--cert-file` options.

### `.hz/config.toml` file

One can also configure Horizon with a `.hz/config.toml` [toml](https://github.com/toml-lang/toml) configuration file. Here is an example configuration file below. Note that by default, `hz serve` will look for `.hz/config.toml` (which is created by `hz init`) in the current directory.

This example shows the current defaults. To change them, you need to remove the `#` from the beginning of the line and change the value. Note that `[ table_name ]` toml table declarations need to also be uncommented in the OAuth configuration at the end of the file.

```toml
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
# project = "horizon"
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
token_secret = <Long base64 key automatically generated by hz init>
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
```


## Setting up your Horizon Dev Environment

If you are looking to work on Horizon itself, you will want your recent
changes to update your command line client `hz` without having to go back
into each `/client`, `/server`, and `/cli` directory to reinstall. So you
will want to use `npm link` to update this on the fly.

We've included a script at `/test/setupDev.sh` that you can run while
currently in the `/test` directory that will set your `hz` up in your
global npm folder.

Or you can follow these commands which achieve the same result:

```bash
# From the /client directory
npm link

# From the /server directory
npm link ../client
npm link

# From the /cli directory
npm link ../server
npm link ../client
npm link
```
