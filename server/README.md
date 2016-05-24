# Horizon Server

An extensible middleware server built on top of [RethinkDB](https://github.com/rethinkdb/rethinkdb) which exposes a websocket API to front-end applications.

## Documentation

Follow our documentation at [horizon.io/install](https://horizon.io/install) for instructions on installing Horizon.

## Requirements
The Horizon server requires some tools and libraries to be available before it
can run:

 * `node.js` - interpreter to run the Horizon server
 * `openssl` - generating ssl certificates
 * [`rethinkdb`](https://github.com/rethinkdb/rethinkdb) - for running a RethinkDB server

### OpenSSL

OpenSSL is required to generate the cert and key pair necessary to serve Horizon securely via HTTPS and WSS. Usually this is done on the production server where you are running Horizon, however to do this locally you'll need to have the OpenSSL installed.

* **OSX**    - `brew install openssl`
* **Ubuntu** -  [Follow this guide here](https://help.ubuntu.com/community/OpenSSL#Practical_OpenSSL_Usage).
* **Windows** - [Unofficial list of Windows OpenSSL Binaries](https://wiki.openssl.org/index.php/Binaries)

### RethinkDB

Check out [rethinkdb.com/install](https://rethinkdb.com/install) for the best method of installing RethinkDB on your platform.
