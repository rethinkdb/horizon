'use strict';

const error = require('./error');
const Index = require('./index').Index;

const r = require('rethinkdb');

class Collection {
  constructor(data, db, conn) {
    this.name = data.id;
    this.table = r.db(db).table(data.table);
    this.indexes = new Map();

    this.update_indexes([ ]);

    this.promise =
      this.table
        .wait({ waitFor: 'all_replicas_ready' })
        .run(conn)
        .then(() => {
          this.promise = null;
        });

    this.promise.catch(() => { });
  }

  on_ready(done) {
    this.promise ? this.promise.then(() => done(), (err) => done(err)) : done();
  }

  update_indexes(indexes, conn) {
    // Clear all indexes, then re-add the latest set
    // This will cause new requests to wait until we have confirmation that the
    // indexes are ready, but it saves us from needing more-complicated machinery
    // to ensure we don't miss changes to the set of indexes. (i.e. if an index is
    // deleted then immediately recreated, or replaced by a post-constructing index)
    this.indexes.clear();

    // Initialize the primary index, which won't show up in the changefeed
    indexes.push(Index.fields_to_name([ 'id' ]));
    indexes.map((name) => this.indexes.set(name, new Index(name, this.table, conn)));
  }

  create_index(fields, conn, done) {
    const index_name = Index.fields_to_name(fields);

    const success = () => {
      const index = new Index(index_name, this.table, conn);
      this.indexes.set(index_name, index);
      return index.promise.then(() => done());
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

    let match = undefined;
    for (const index of this.indexes.values()) {
      if (index.is_match(fuzzy_fields, ordered_fields)) {
        if (!index.promise) {
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
