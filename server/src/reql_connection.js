'use strict';

const check = require('./error').check;
const logger = require('./logger');
const Metadata = require('./metadata/metadata').Metadata;
const r = require('rethinkdb');

const default_user = 'admin';
const default_pass = '';

class ReqlConnection {
  constructor(host, port, db,
              auto_create_collection, auto_create_index,
              user, pass, connect_timeout,
              interruptor) {
    this._rdb_options = {
      host,
      port,
      db,
      user: user || default_user,
      password: pass || default_pass,
      timeout: connect_timeout || null,
    };

    this._auto_create_collection = auto_create_collection;
    this._auto_create_index = auto_create_index;
    this._clients = new Set();
    this._reconnect_delay = 0;
    this._retry_timer = null;

    interruptor.catch((err) => {
      if (this._retry_timer) {
        clearTimeout(this._retry_timer);
      }

      this._clients.forEach((client) =>
        client.close({ error: err.message }));
      this._clients.clear();

      this._interrupted_err = err;
      this._reconnect(); // This won't actually reconnect, but will do all the cleanup
    });

    logger.info('Connecting to RethinkDB: ' +
      `${this._rdb_options.user} @ ${this._rdb_options.host}:${this._rdb_options.port}`);
    this._ready_promise = this._reconnect();
  }

  _reconnect() {
    if (this._conn) {
      this._conn.removeAllListeners('close');
      this._conn.close();
    }
    if (this._metadata) {
      this._metadata.close();
    }
    this._conn = null;
    this._metadata = null;

    this._clients.forEach((client) =>
      client.close({ error: 'Connection to the database was lost.' }));
    this._clients.clear();

    if (this._interrupted_err) {
      return Promise.reject(this._interrupted_err);
    } else if (!this._retry_timer) {
      return new Promise((resolve) => {
        this._retry_timer = setTimeout(() => resolve(this._init_connection()), this._reconnect_delay);
        this._reconnect_delay = Math.min(this._reconnect_delay + 100, 1000);
      });
    }
  }

  _init_connection() {
    this._retry_timer = null;

    return r.connect(this._rdb_options).then((conn) => {
      if (this._interrupted_err) {
        return Promise.reject(this._interrupted_err);
      }
      this._conn = conn;
      logger.debug('Connection to RethinkDB established.');
      return new Metadata(this._rdb_options.db,
                          conn,
                          this._clients,
                          this._auto_create_collection,
                          this._auto_create_index).ready();
    }).then((metadata) => {
      logger.info('Connection to RethinkDB ready: ' +
        `${this._rdb_options.user} @ ${this._rdb_options.host}:${this._rdb_options.port}`);

      this._metadata = metadata;
      this._reconnect_delay = 0;

      this._conn.once('close', () => {
        logger.error('Lost connection to RethinkDB.');
        this._reconnect();
      });

      // This is to avoid EPIPE errors - handling is done by the 'close' listener
      this._conn.on('error', () => { });

      return this;
    }).catch((err) => {
      logger.error(`Connection to RethinkDB terminated: ${err}`);
      logger.debug(`stack: ${err.stack}`);
      return this._reconnect();
    });
  }

  is_ready() {
    return Boolean(this._conn);
  }

  ready() {
    return this._ready_promise;
  }

  connection() {
    check(this.is_ready(), 'Connection to the database is down.');
    return this._conn;
  }

  metadata() {
    check(this.is_ready(), 'Connection to the database is down.');
    check(this._metadata, 'Connection to the database is initializing.');
    return this._metadata;
  }
}

module.exports = { ReqlConnection };
