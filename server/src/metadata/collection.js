'use strict';

const error = require('../error');

const r = require('rethinkdb');

class Collection {
  constructor(data, db) {
    this.name = data.id;
    this._waiters = [ ];
    this.changed(data, db);
  }

  close() {
    if (this._table) {
      this._table.close();
      this._table = null;
    } else {
      this._waiters.forEach((w) => w(new Error('collection deleted')));
      this._waiters = [ ];
    }
  }

  changed(data, db) {
    error.check(this.name === data.id, 'Collections cannot be renamed.');

    this.table = r.db(db).table(data.table); // This is the ReQL `Table` object
    this._table_name = data.table;
    this._table = null; // This is the Horizon `Table` object
  }

  on_ready(done) {
    if (this._table) {
      this._table.on_ready(done);
    } else {
      this._waiters.push(done);
    }
  }

  set_table(table) {
    table.collection = this;
    this._table = table;
    this._waiters.forEach((done) => this._table.on_ready(done));
    this._waiters = [ ];
  }

  create_index() {
    if (!this._table) {
      throw new error.CollectionNotReady(this);
    }
    return this._table.create_index.apply(this._table, arguments);
  }

  get_matching_index() {
    if (!this._table) {
      throw new error.CollectionNotReady(this);
    }
    return this._table.get_matching_index.apply(this._table, arguments);
  }
}

module.exports = { Collection };
