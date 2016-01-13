'use strict';

const { check } = require('./error');
const logger = require('./logger');
const { Metadata } = require('./metadata');
const r = require('rethinkdb');

class ReqlConnection {
  constructor(host, port, db, auto_create_table, auto_create_index, clients) {
    this.host = host;
    this.port = port;
    this.db = db;
    this.auto_create_table = auto_create_table;
    this.auto_create_index = auto_create_index;
    this.clients = clients;
    this.connection = undefined;
    this.reconnect_delay = 0;
    this._ready = false;
    this._ready_promise = new Promise((resolve) => this.init_connection(resolve));
  }

  reconnect(resolve) {
    this.connection = undefined;
    this.metadata = undefined;
    this.clients.forEach((client) => client.reql_connection_lost());
    this.clients.clear();
    setTimeout(() => this.init_connection(resolve), this.reconnect_delay);
    this.reconnect_delay = Math.min(this.reconnect_delay + 100, 1000);
  }

  init_connection(resolve) {
    logger.info(`Connecting to RethinkDB: ${this.host}:${this.port}`);
    r.connect({ host: this.host, port: this.port, db: this.db })
     .then((conn) => {
       logger.info(`Connection to RethinkDB established.`);
       conn.on('close', () => this.reconnect(resolve));
       this.connection = conn;
       this.connection.on('error', (err) => this.handle_conn_error(err));
       this.metadata = new Metadata(this.connection, this.auto_create_table, this.auto_create_index, (err) => {
         if (err !== undefined) {
           const message = err.msg ? err.msg : err;
           logger.error(`Failed to synchronize with database server: ${message}`);
           conn.close();
         } else {
           conn.removeAllListeners('close');
           conn.on('close', () => {
             this._ready_promise = new Promise((res) => this.reconnect(res));
           });
           this.reconnect_delay = 0;
           this._ready = true;
           resolve();
         }
       });
     },
     (err) => {
       logger.error(`Connection to RethinkDB terminated: ${err}`);
       this.reconnect(resolve);
     });
  }

  is_ready() {
    return this._ready;
  }

  ready() {
    return this._ready_promise;
  }

  get_connection() {
    check(this._ready, `Connection to the database is down.`);
    return this.connection;
  }

  get_metadata() {
    check(this._ready, `Connection to the database is down.`);
    return this.metadata;
  }

  close() {
    if (this.connection) {
      this.connection.close();
    }
  }
}

module.exports = { ReqlConnection };
