# Setup
The server requires some setup before it can be used.

## Requirements
The fusion server requires some tools and libraries to be available before it
can run:

 * `node.js` - interpreter to run the fusion server
  * package `ws` - for communicating with fusion clients over websockets
  * package `rethinkdb` - for connecting to a rethinkdb server
 * `openssl` - for generating ssl certificates
 * `rethinkdb` - for running a rethinkdb server

## Generate key files for https
There are proper ways to get a certificate registered through a Certificate
Authority, but for the purpose of getting up-and-running as soon as possible,
generate a self-signed certificate.  This command will generate the certificate
using the default options from `openssl`, and should not be used for anything
serious:

`openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes -batch`

## Launch the server
TODO: add command-line options or configuration

`node --use-strict server/src/main.js`
