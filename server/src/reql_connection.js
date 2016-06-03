'use strict';

const check = require('./error').check;
const logger = require('./logger');
const Metadata = require('./metadata/metadata').Metadata;
const r = require('rethinkdb');
const utils = require('./utils');

class ReqlConnection {
  constructor(host, port, project_name, auto_create_collection, auto_create_index) {
    this._host = host;
    this._port = port;
    this._project_name = project_name;
    this._auto_create_collection = auto_create_collection;
    this._auto_create_index = auto_create_index;
    this._clients = new Set();
    this._connection = undefined;
    this._metadata = undefined;
    this._ready = false;
    this._reconnect_delay = 0;
    this._ready_promise = new Promise((resolve) => this._reconnect(resolve));
    this._closed = false;
    this._hasRetried = false;
  }

  _reconnect(resolve) {
    if (this._connection) {
      this._connection.close();
    }
    if (this._metadata) {
      this._metadata.close();
    }
    this._connection = undefined;
    this._metadata = undefined;
    this._ready = false;
    this._clients.forEach((client) =>
      client.close({ error: 'Connection to the database was lost.' }));
    this._clients.clear();

    if (!this._closed) {
      setTimeout(() => this._init_connection(resolve), this._reconnect_delay);
      this._reconnect_delay = Math.min(this._reconnect_delay + 100, 1000);
    }
  }

  _init_connection(resolve) {
    let retried = false;
    const retry = () => {
      if (!retried) {
        retried = true;
        if (!this._ready) {
          this._reconnect(resolve);
        } else {
          this._ready_promise = new Promise((new_resolve) => this._reconnect(new_resolve));
        }
      }
    };

    if (!this._hasRetried) {
      logger.info(`Connecting to RethinkDB: ${this._host}:${this._port}`);
      this._hasRetried = true;
    }
    r.connect({ host: this._host, port: this._port, db: this._project_name })
     .then((conn) => {
       logger.debug('Connection to RethinkDB established.');
       conn.once('close', () => {
         retry();
       });
       conn.on('error', (err) => {
         logger.error(`Error on connection to RethinkDB: ${err}.`);
         retry();
       });
       return conn.server().then((serv) =>
         r.db('rethinkdb').table('server_status')
          .get(serv.id)('process')('version')
          .run(conn)
          .then((res) => {
            utils.rethinkdb_version_check(res);
            return conn;
          }));
     }).then((conn) => {
       this._connection = conn;
       this._metadata = new Metadata(this._project_name,
                                     this._connection,
                                     this._clients,
                                     this._auto_create_collection,
                                     this._auto_create_index);
       return this._metadata.ready();
     }).then(() => {
       logger.info('Metadata synced with database, ready for traffic.');
       this._reconnect_delay = 0;
       this._ready = true;
       resolve(this);
     }).catch((err) => {
       if (err instanceof r.Error.ReqlDriverError ||
           err instanceof r.Error.ReqlAvailabilityError) {
         logger.debug(`Connection to RethinkDB terminated: ${err}`);
       } else {
         logger.error(`Connection to RethinkDB terminated: ${err}`);
       }
       logger.debug(`stack: ${err.stack}`);
       retry();
     });
  }

  is_ready() {
    return this._ready;
  }

  ready() {
    return this._ready_promise;
  }

  connection() {
    check(this._ready, 'Connection to the database is down.');
    return this._connection;
  }

  metadata() {
    check(this._ready, 'Connection to the database is down.');
    return this._metadata;
  }

  close() {
    this._closed = true;
    this._reconnect(); // This won't actually reconnect, but will do all the cleanup
  }
}

module.exports = { ReqlConnection };
