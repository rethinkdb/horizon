'use strict';

const error = require('../error');

class Collection {
  constructor(name, table_id) {
    this.name = name;
    this._waiters = [ ];
    this.table = null; // This is the ReQL Table object
    this._table = null; // This is the Horizon Table object
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

  on_ready(done) {
    if (this._table) {
      this._table.on_ready(done);
    } else {
      this._waiters.push(done);
    }
  }

  set_table(table) {
    const old_table = this._table;
    this.table = null;
    this._table = null;

    if (old_table) {
      // Take back any waiters from the old Table
      old_table._waiters.forEach((done) => this.on_ready(done));
      old_table._waiters = [ ];
    }

    if (table) {
      table.collection = this;
      this.table = table.table;
      this._table = table;
      this._waiters.forEach((done) => this._table.on_ready(done));
      this._waiters = [ ];
    }
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
