'use strict';

const error = require('../error');
const Table = require('./table').Table;

const r = require('rethinkdb');

class Collection {
  constructor(db, name) {
    this.name = name;
    this.table = r.db(db).table(name); // This is the ReQL Table object
    this._tables = new Map(); // A Map of Horizon Table objects
    this._registered = false; // Whether the `hz_collections` table says this collection exists
    this._waiters = [ ];
  }

  _close() {
    this._tables.forEach((table) => {
      table._waiters.forEach((w) => w(new Error('collection deleted')));
      table._waiters = [ ];
      table.close();
    });
    this._waiters.forEach((w) => w(new Error('collection deleted')));
    this._waiters = [ ];
  }

  _update_table(table_id, indexes, conn) {
    let table = this._tables.get(table_id);
    if (indexes) {
      if (!table) {
        table = new Table(this.table, conn);
        this._tables.set(table_id, table);
      }
      table.update_indexes(indexes, conn);
      this._waiters.forEach((w) => table.on_ready(w));
      this._waiters = [ ];
    } else {
      this._tables.delete(table_id);
      if (table) {
        table._waiters.forEach((w) => this.on_ready(w));
        table._waiters = [ ];
        table.close();
      }
    }
  }

  _register() {
    this._registered = true;
  }

  _unregister() {
    this._registered = false;
  }

  _is_safe_to_remove() {
    return this._tables.size === 0 && !this._registered;
  }

  _on_ready(done) {
    if (this._tables.size === 0) {
      this._waiters.push(done);
    } else {
      this._get_table().on_ready(done);
    }
  }

  _get_table() {
    if (this._tables.size === 0) {
      throw new error.CollectionNotReady(this);
    }
    return this._tables.values().next().value;
  }

  _create_index(fields, conn, done) {
    return this._get_table().create_index(fields, conn, done);
  }

  get_matching_index(fuzzy_fields, ordered_fields) {
    const match = this._get_table().get_matching_index(fuzzy_fields, ordered_fields);

    if (match && !match.ready()) {
      throw new error.IndexNotReady(this, match);
    } else if (!match) {
      throw new error.IndexMissing(this, fuzzy_fields.concat(ordered_fields));
    }

    return match;
  }
}

module.exports = { Collection };
