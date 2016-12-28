'use strict';

const Index = require('./index');
const {primaryIndexName, indexInfoToReql, indexInfoToName} = require('../indexes');

const assert = require('assert');

class Table {
  constructor(reqlTable, conn, log, r) {
    this.r = r;
    this.log = log;
    this.conn = conn;
    this.table = reqlTable;
    this.indexes = new Map();

    this._waiters = [];
    this._result = null;

    this.table
      .wait({waitFor: 'all_replicas_ready'})
      .run(this.conn())
      .then(() => {
        this._result = true;
        this._waiters.forEach((w) => w());
        this._waiters = [];
      }).catch((err) => {
        this._result = err;
        this._waiters.forEach((w) => w(err));
        this._waiters = [];
      });
  }

  close() {
    this._waiters.forEach((w) => w(new Error('collection deleted')));
    this._waiters = [];

    this.indexes.forEach((i) => i.close());
    this.indexes.clear();
  }

  ready() {
    return this._result === true;
  }

  onReady(done) {
    if (this._result === true) {
      done();
    } else if (this._result) {
      done(this._result);
    } else {
      this._waiters.push(done);
    }
  }

  updateIndexes(indexes) {
    this.log('debug', `${this.table} indexes changed, reevaluating`);

    // Initialize the primary index, which won't show up in the changefeed
    indexes.push(primaryIndexName);

    const newIndexMap = new Map();
    indexes.forEach((name) => {
      try {
        const oldIndex = this.indexes.get(name);
        const newIndex = new Index(name, this.table, this.conn, this.log);
        if (oldIndex) {
          // Steal any waiters from the old index
          newIndex._waiters = oldIndex._waiters;
          oldIndex._waiters = [];
        }
        newIndexMap.set(name, newIndex);
      } catch (err) {
        this.log('warn', `${err}`);
      }
    });

    this.indexes.forEach((i) => i.close());
    this.indexes = newIndexMap;
    this.log('debug', `${this.table} indexes updated`);
  }

  // TODO: support geo and multi indexes
  createIndex(fields, done) {
    const info = {geo: false, multi: false, fields};
    const indexName = indexInfoToName(info);
    assert(!this.indexes.get(indexName), 'index already exists');

    const success = () => {
      // Create the Index object now so we don't try to create it again before the
      // feed notifies us of the index creation
      const newIndex = new Index(indexName, this.table, this.conn, this.log);
      // TODO: shouldn't this be done before we go async?
      this.indexes.set(indexName, newIndex);
      return newIndex.onReady(done);
    };

    this.table.indexCreate(indexName, indexInfoToReql(info),
                           {geo: info.geo, multi: (info.multi !== false)})
      .run(this.conn())
      .then(success)
      .catch((err) => {
        if (err instanceof this.r.Error.ReqlError &&
            err.msg.indexOf('already exists') !== -1) {
          success();
        } else {
          done(err);
        }
      });
  }

  // Returns a matching (possibly compound) index for the given fields
  // `fuzzyFields` and `orderedFields` should both be arrays
  getMatchingIndex(fuzzyFields, orderedFields) {
    if (fuzzyFields.length === 0 && orderedFields.length === 0) {
      return this.indexes.get(primaryIndexName);
    }

    let match;
    for (const i of this.indexes.values()) {
      if (i.isMatch(fuzzyFields, orderedFields)) {
        if (i.ready()) {
          return i;
        } else if (!match) {
          match = i;
        }
      }
    }

    return match;
  }
}

module.exports = Table;
