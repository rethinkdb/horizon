# Fusion Server

An extensible middleware server built on top of [RethinkDB](https://github.com/rethinkdb/rethinkdb) which exposes a websocket API to front-end applications.

## Requirements
The Fusion server requires some tools and libraries to be available before it
can run:

 * `node.js` - interpreter to run the Fusion server
 * npm packages
  * [`argparse`](https://www.npmjs.com/package/argparse) - parsing command line arguments
  * [`joi`](https://www.npmjs.com/package/joi) - object schema validation
  * [`rethinkdb`](https://www.npmjs.com/package/rethinkdb) - js client for connecting to a RethinkDB server
  * [`winston`](https://www.npmjs.com/package/winston) - async logging
  * [`ws`](https://www.npmjs.com/package/ws) - communicating with Fusion clients over websockets
 * `openssl` - generating ssl certificates
 * [`rethinkdb`](https://github.com/rethinkdb/rethinkdb) - for running a RethinkDB server

## Installation

At the moment, there are a couple steps to getting Fusion running on your system. In the future, we plan to have most if not all of this compressed into a single `npm install -g fusion`.

### Node.js

The Fusion server runs on NodeJS which you will need to install. Go to [nodejs.org](https://nodejs.org) for the latest stable version.

### npm packages

Like most javascript frameworks, this relies on a few other npm dependencies to function.

```sh
# From within this directory
npm install
```

### OpenSSL

OpenSSL is required to generate the cert and key pair necessary to serve Fusion securely via HTTPS and WSS. Usually this is done on the production server where you are running Fusion, however to do this locally you'll need to have the OpenSSL installed.

* **OSX**    - `brew install openssl`
* **Ubuntu** -  [Follow this guide here](https://help.ubuntu.com/community/OpenSSL#Practical_OpenSSL_Usage).
* **Windows** - [Unofficial list of Windows OpenSSL Binaries](https://wiki.openssl.org/index.php/Binaries)

### RethinkDB

Check out [rethinkdb.com/install](https://rethinkdb.com/install) for the best method of installing RethinkDB on your platform.

## Launch the server

Lastly, from within this directory you can run:

```sh
npm install -g
```

Which will install Fusion on your path and allow you to just type:

```bash
fusion --dev
```
However, if you do a `git pull` you will need to rerun this command to update it. For a more bare metal approach just run:

```sh
./src/main.js --dev
```

This serves Fusion queries on `ws://localhost:8181`, serves the Fusion client library on `http://localhost:8181/fusion/fusion.js`, and connects to the RethinkDB server at `localhost:28015`.

##### Available options

Command Flag| Description
------------|----------------------------------
  --bind HOST         | Local hostname to serve Fusion on (repeatable).
  --port PORT         | Local port to serve fusion on. Defaults to `8181`.
  --connect HOST:PORT | Host and port of the RethinkDB server to connect to. Defaults to localhost:28015
  --key-file PATH     | Path to the key file to use, defaults to `./key.pem`.
  --cert-file PATH    | Path to the cert file to use, defaults to `./cert.pem`.
  --debug             | Enable debug logging.
  --insecure          | Serve insecure websockets, ignore `--key-file` and `--cert-file`.
  --auto-create-table | Create tables used by requests if they do not exist
  --auto-create-index | Create indexes used by requests if they do not exist
  --dev               | Runs the server in development mode, this sets `--debug`, `--insecure`, `--auto-create-tables`, and `--auto-create-indexes`.

## Generate key files for SSL
There are proper ways to get a certificate registered through a Certificate
Authority, but for the purpose of getting up-and-running as soon as possible,
generate a self-signed certificate.  This command will generate the certificate
using the default options from `openssl`, and should not be used for anything
serious:

```sh
openssl req -x509 -newkey rsa:2048 -keyout fusion-key.pem -out fusion-cert.pem -days 365 -nodes -batch
```

Once a key file and cert file have been obtained, launch the server without the `--insecure`
flag, and provide the files in the `--key-file` and `--cert-file` options.

## Running tests

In addition to the requirements for the fusion server:
 * `mocha` - for running the test suites

`mocha --harmony-destructuring test`
This runs the suite of tests using ad-hoc instances of RethinkDB, Fusion, and generated SSL certificates.
No preparation should be necessary aside from installing the required programs and modules.

A log file is created, 'fusion_test_*.log', named by the `pid` of the test process.  In addition, the
ad-hoc RethinkDB instance will create a data directory, './rethinkdb_data_test'.  Unless something goes wrong, the RethinkDB data directory should be cleaned up by the tests at exit.
