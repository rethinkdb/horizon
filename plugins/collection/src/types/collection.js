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

  _updateTable(tableId, indexes, conn) {
    let table = this._tables.get(tableId);
    if (indexes) {
      if (!table) {
        table = new Table(this.table, conn);
        this._tables.set(tableId, table);
      }
      table.updateIndexes(indexes, conn);
      this._waiters.forEach((w) => table.onReady(w));
      this._waiters = [];
    } else {
      this._tables.delete(tableId);
      if (table) {
        table._waiters.forEach((w) => this.onReady(w));
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

  _isSafeToRemove() {
    return this._tables.size === 0 && !this._registered;
  }

  _onReady(done) {
    if (this._tables.size === 0) {
      this._waiters.push(done);
    } else {
      this._getTable().onReady(done);
    }
  }

  _getTable() {
    if (this._tables.size === 0) {
      throw new Error(`Collection ${this.name} is not ready.`);
    }
    return this._tables.values().next().value;
  }

  _createIndex(fields, done) {
    return this._getTable().createIndex(fields, this.reliableConn.connection(), done);
  }

  ready() {
    if (this._tables.size === 0) {
      return false;
    }
    return this._getTable().ready();
  }

  getMatchingIndex(fuzzyFields, orderedFields) {
    return new Promise((resolve, reject) => {
      const done = (indexOrErr) => {
        if (indexOrErr instanceof Error) {
          reject(indexOrErr);
        } else {
          resolve(indexOrErr);
        }
      };

      const match = this._getTable().getMatchingIndex(fuzzyFields, orderedFields);
      if (match) {
        if (match.ready()) {
          resolve(match);
        } else {
          match.onReady(done);
        }
      } else {
        this._createIndex(fuzzyFields.concat(orderedFields), done);
      }
    });
  }
}

module.exports = Collection;
