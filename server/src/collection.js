'use strict';

const error = require('./error');
const Index = require('./index');

const r = require('rethinkdb');

class Collection {
  constructor(data, conn) {
    this.name = data.id;
    this.table = data.table;
    this.indexes = new Map();

    // Initialize the primary index, which won't show up in the changefeed
    const primary_index_name = Index.fields_to_name([ 'id' ]);
    this.indexes.set(primary_index_name, new Index(primary_index_name, conn));

    this.promise =
      r.table(this.table)
        .wait({ waitFor: 'all_replicas_ready' })
        .run(conn)
        .then(() => {
          this.promise = null;
        });
  }

  on_ready(done) {
    this.promise ? this.promise.then(() => done(), (err) => done(err)) : done();
  }

  update_indexes(indexes, conn) {

  }

  create_index(fields, conn, done) {
    const index_name = Index.fields_to_name(fields);

    const success = () => {
      const index = new Index(index_name, conn);
      this.indexes.set(index_name, index);
      return index.promise.then(() => done());
    };

    r.table(this.table)
      .indexCreate(index_name, (row) => fields.map((key) => row(key)))
      .run(conn)
      .then(success)
      .catch((err) => {
        if (err instanceof r.ReqlError &&
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
    let match = undefined;
    for (const index of this.indexes.values()) {
      if (index.is_match(fuzzy_fields, ordered_fields)) {
        if (index.promise === undefined) {
          return index;
        } else if (match === undefined) {
          match = index;
        }
      }
    }

    if (match === undefined) {
      throw new error.IndexMissing(this, fuzzy_fields.concat(ordered_fields));
    } else {
      throw new error.IndexNotReady(this, match);
    }
  }
}

module.exports = { Collection };
