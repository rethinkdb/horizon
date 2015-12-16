# Setup
The server requires some setup before it can be used.

## Requirements
The fusion server requires some tools and libraries to be available before it
can run:

 * `node.js` - interpreter to run the fusion server
  * package `ws` - for communicating with fusion clients over websockets
  * package `winston` - for logging in the fusion server
  * package `rethinkdb` - for connecting to a rethinkdb server
 * `openssl` - for generating ssl certificates
 * `rethinkdb` - for running a rethinkdb server

## Launch the server

`node --harmony-destructuring src/main.js --unsecure`
This serves fusion queries on ws://localhost:8181, and connects to the RethinkDB server at localhost:31420.  Run the server with `--help` for a list of available options.

## Generate key files for SSL
There are proper ways to get a certificate registered through a Certificate
Authority, but for the purpose of getting up-and-running as soon as possible,
generate a self-signed certificate.  This command will generate the certificate
using the default options from `openssl`, and should not be used for anything
serious:

`openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes -batch`

Once a key file and cert file have been obtained, launch the server without the `--unsecure`
flag, and provide the files in the `--key-file` and `--cert-file` options.

## Running tests

In addition to the requirements for the fusion server:
 * `mocha` - for running the test suites

`mocha --harmony-destructuring test`
This runs the suite of tests using ad-hoc instances of RethinkDB, Fusion, and generated SSL certificates.
No preparation should be necessary aside from installing the required programs and modules.

A log file is created, 'fusion_test_*.log', named by the `pid` of the test process.  In addition, the
ad-hoc RethinkDB instance will create a data directory, './rethinkdb_data_test'.  Unless something goes wrong, the RethinkDB data directory should be cleaned up by the tests at exit.
