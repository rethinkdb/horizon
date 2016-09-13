'use strict';

const Table = require('./table');

const {r} = require('@horizon/server');

class Collection {
  constructor(db, name, reliableConn) {
    this.name = name;
    this.reliableConn = reliableConn;
    this.table = r.db(db).table(name); // This is the ReQL Table object
    this._tables = new Map(); // A Map of Horizon Table objects
    this._registered = false; // Whether the `hz_collections` table thinks this exists
    this._waiters = [];
  }

  close() {
    this._tables.forEach((table) => {
      table._waiters.forEach((w) => w(new Error('collection deleted')));
      table._waiters = [];
      table.close();
    });
    this._waiters.forEach((w) => w(new Error('collection deleted')));
    this._waiters = [];
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
      this._waiters = [];
    } else {
      this._tables.delete(table_id);
      if (table) {
        table._waiters.forEach((w) => this.on_ready(w));
        table._waiters = [];
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
      throw new Error(`Collection ${this.name} is not ready.`);
    }
    return this._tables.values().next().value;
  }

  _create_index(fields, done) {
    return this._get_table().create_index(fields, this.reliableConn.connection(), done);
  }

  ready() {
    if (this._tables.size === 0) {
      return false;
    }
    return this._get_table().ready();
  }

  get_matching_index(fuzzy_fields, ordered_fields) {
    return new Promise((resolve, reject) => {
      const done = (indexOrErr) => {
        if (indexOrErr instanceof Error) {
          reject(indexOrErr);
        } else {
          resolve(indexOrErr);
        }
      };

      const match = this._get_table().get_matching_index(fuzzy_fields, ordered_fields);
      if (match) {
        if (match.ready()) {
          resolve(match);
        } else {
          match.on_ready(done);
        }
      } else {
        this._create_index(fuzzy_fields.concat(ordered_fields), done);
      }
    });
  }
}

module.exports = Collection;
