# Horizon Server

An extensible middleware server built on top of [RethinkDB](https://github.com/rethinkdb/rethinkdb) which exposes a websocket API to front-end applications.

## Requirements
The Horizon server requires some tools and libraries to be available before it
can run:

 * `node.js` - interpreter to run the Horizon server
 * npm packages
  * [`argparse`](https://www.npmjs.com/package/argparse) - parsing command line arguments
  * [`joi`](https://www.npmjs.com/package/joi) - object schema validation
  * [`rethinkdb`](https://www.npmjs.com/package/rethinkdb) - js client for connecting to a RethinkDB server
  * [`winston`](https://www.npmjs.com/package/winston) - async logging
  * [`ws`](https://www.npmjs.com/package/ws) - communicating with Horizon clients over websockets
 * `openssl` - generating ssl certificates
 * [`rethinkdb`](https://github.com/rethinkdb/rethinkdb) - for running a RethinkDB server

### OpenSSL

OpenSSL is required to generate the cert and key pair necessary to serve Horizon securely via HTTPS and WSS. Usually this is done on the production server where you are running Horizon, however to do this locally you'll need to have the OpenSSL installed.

* **OSX**    - `brew install openssl`
* **Ubuntu** -  [Follow this guide here](https://help.ubuntu.com/community/OpenSSL#Practical_OpenSSL_Usage).
* **Windows** - [Unofficial list of Windows OpenSSL Binaries](https://wiki.openssl.org/index.php/Binaries)

### RethinkDB

Check out [rethinkdb.com/install](https://rethinkdb.com/install) for the best method of installing RethinkDB on your platform.


## Generate key files for SSL
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

## Running tests

Make sure you run `npm install` to get mocha first then:

```js
npm test
```

This runs the suite of tests using ad-hoc instances of RethinkDB, Horizon, and generated SSL certificates.
No preparation should be necessary aside from installing the required programs and modules.

A log file is created, 'horizon_test_*.log', named by the `pid` of the test process.  In addition, the
ad-hoc RethinkDB instance will create a data directory, './rethinkdb_data_test'.  Unless something goes wrong, the RethinkDB data directory should be cleaned up by the tests at exit.
