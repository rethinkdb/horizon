'use strict';

const error = require('../error');
const index = require('./index');
const logger = require('../logger');

const r = require('rethinkdb');

class Table {
  constructor(reql_table, conn) {
    this.table = reql_table;
    this.indexes = new Map();

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
    logger.debug(`${this.table} indexes changed, reevaluating`);

    // Initialize the primary index, which won't show up in the changefeed
    indexes.push(index.primary_index_name);

    const new_index_map = new Map();
    indexes.forEach((name) => {
      try {
        const old_index = this.indexes.get(name);
        const new_index = new index.Index(name, this.table, conn);
        if (old_index) {
          // Steal any waiters from the old index
          new_index._waiters = old_index._waiters;
          old_index._waiters = [ ];
        }
        new_index_map.set(name, new_index);
      } catch (err) {
        logger.warn(`${err}`);
      }
    });

    this.indexes.forEach((i) => i.close());
    this.indexes = new_index_map;
    logger.debug(`${this.table} indexes updated`);
  }

  // TODO: support geo and multi indexes
  create_index(fields, conn, done) {
    const info = { geo: false, multi: false, fields };
    const index_name = index.info_to_name(info);
    error.check(!this.indexes.get(index_name), 'index already exists');

    const success = () => {
      // Create the Index object now so we don't try to create it again before the
      // feed notifies us of the index creation
      const new_index = new index.Index(index_name, this.table, conn);
      this.indexes.set(index_name, new_index); // TODO: shouldn't this be done before we go async?
      return new_index.on_ready(done);
    };

    this.table.indexCreate(index_name, index.info_to_reql(info),
                           { geo: info.geo, multi: (info.multi !== false) })
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
      return this.indexes.get(index.primary_index_name);
    }

    let match;
    for (const i of this.indexes.values()) {
      if (i.is_match(fuzzy_fields, ordered_fields)) {
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

module.exports = { Table };
