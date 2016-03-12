'use strict';

const check = require('./error').check;
const logger = require('./logger');
const Metadata = require('./metadata').Metadata;
const r = require('rethinkdb');
const utils = require("./utils");

class ReqlConnection {
  constructor(host, port, db, auto_create_table, auto_create_index, clients) {
    this._host = host;
    this._port = port;
    this._db = db;
    this._auto_create_table = auto_create_table;
    this._auto_create_index = auto_create_index;
    this._clients = clients;
    this._connection = undefined;
    this._metadata = undefined;
    this._ready = false;
    this._reconnect_delay = 0;
    this._ready_promise = new Promise((resolve) => this._reconnect(resolve));
  }

  _reconnect(resolve) {
    this._connection = undefined;
    this._metadata = undefined;
    this._ready = false;
    this._clients.forEach((client) => client.reql_connection_lost());
    this._clients.clear();
    setTimeout(() => this._init_connection(resolve), this._reconnect_delay);
    this._reconnect_delay = Math.min(this._reconnect_delay + 100, 1000);
  }

  _init_connection(resolve) {
    logger.info(`Connecting to RethinkDB: ${this._host}:${this._port}`);
    r.connect({ host: this._host, port: this._port, db: this._db })
     .then((conn) => {
       logger.info('Connection to RethinkDB established.');
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
       this._metadata = new Metadata(this._connection,
                                     this._auto_create_table,
                                     this._auto_create_index);
       return this._metadata.ready();
     }).then(() => {
       this._reconnect_delay = 0;
       this._ready = true;
       this._connection.once('close', () => {
         this._ready_promise = new Promise((res) => this._reconnect(res));
       });
       logger.info('Metadata synced with database, ready for traffic.');
       resolve(this);
     }).catch((err) => {
       logger.error(`Connection to RethinkDB terminated: ${err}`);
       logger.debug(`stack: ${err.stack}`);
       this._reconnect(resolve);
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
    if (this._connection) {
      this._connection.close();
    }
  }
}

module.exports = { ReqlConnection };
