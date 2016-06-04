'use strict';

const error = require('../error');
const Index = require('./index').Index;

const r = require('rethinkdb');

class Table {
  constructor(table_name, db, conn) {
    this.collection = null; // This will be set when we are attached to a collection
    this.table = r.db(db).table(table_name);
    this.indexes = new Map();
    this.update_indexes([ ]);

    this._waiters = [ ];
    this._result = null;

    this.table
      .wait({ waitFor: 'all_replicas_ready' })
      .run(conn)
      .then(() => {
        this._result = true;
        this._waiters.forEach((w) => w());
        this._waiters = [ ];
      }).catch((err) => {
        this._result = err;
        this._waiters.forEach((w) => w(err));
        this._waiters = [ ];
      });
  }

  close() {
    this._waiters.forEach((w) => w(new Error('collection deleted')));
    this._waiters = [ ];

    this.indexes.forEach((i) => i.close());
    this.indexes.clear();
  }

  ready() {
    return this._result === true;
  }

  on_ready(done) {
    if (this._result === true) {
      done();
    } else if (this._result) {
      done(this._result);
    } else {
      this._waiters.push(done);
    }
  }

  update_indexes(indexes, conn) {
    // Initialize the primary index, which won't show up in the changefeed
    indexes.push(Index.fields_to_name([ 'id' ]));

    const new_index_map = new Map();
    indexes.map((name) => {
      const old_index = this.indexes.get(name);
      const new_index = new Index(name, this.table, conn);
      if (old_index) {
        // Steal any waiters from the old index
        new_index._waiters = old_index._waiters;
        old_index._waiters = [ ];
      }
      new_index_map.set(name, new_index);
    });

    this.indexes.forEach((i) => i.close());
    this.indexes = new_index_map;
  }

  create_index(fields, conn, done) {
    const index_name = Index.fields_to_name(fields);
    error.check(!this.indexes.get(index_name), 'index already exists');

    const success = () => {
      // Create the Index object now so we don't try to create it again before the
      // feed notifies us of the index creation
      const index = new Index(index_name, this.table, conn);
      this.indexes.set(index_name, index);
      return index.on_ready(done);
    };

    this.table.indexCreate(index_name, (row) => fields.map((key) => row(key)))
      .run(conn)
      .then(success)
      .catch((err) => {
        if (err instanceof r.Error.ReqlError &&
            err.msg.indexOf('already exists') !== -1) {
          success();
        } else {
          done(err);
        }
      });
  }

  // Returns a matching (possibly compound) index for the given fields
  // fuzzy_fields and ordered_fields should both be arrays
  get_matching_index(fuzzy_fields, ordered_fields) {
    if (fuzzy_fields.length === 0 && ordered_fields.length === 0) {
      return this.indexes.get(Index.fields_to_name([ 'id' ]));
    }

    let match;
    for (const index of this.indexes.values()) {
      if (index.is_match(fuzzy_fields, ordered_fields)) {
        if (index.ready()) {
          return index;
        } else if (!match) {
          match = index;
        }
      }
    }

    if (match) {
      throw new error.IndexNotReady(this.collection, match);
    } else {
      throw new error.IndexMissing(this.collection, fuzzy_fields.concat(ordered_fields));
    }
  }
}

module.exports = { Table };
