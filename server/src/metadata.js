'use strict';

const { check } = require('./error');
const logger = require('./logger');

const r = require('rethinkdb');

class IndexMissing extends Error {
  constructor(table, fields) {
    super(`Table "${table}" has no index matching ${JSON.stringify(fields)}.`);
    this.table = table;
    this.fields = fields;
  }
}

class TableMissing extends Error {
  constructor(table) {
    super(`Table "${table}" does not exist.`);
    this.table = table;
  }
}

class Index {
  constructor(name, fields) {
    this.name = name;
    this.fields = fields;
  }

  // `fuzzy_fields` may be in any order at the beginning of the index.
  // These must be immediately followed by `ordered_fields` in the exact
  // order given.  There may be no other fields present in the index until
  // after all of `fuzzy_fields` and `ordered_fields` are present.
  // `fuzzy_fields` may overlap with `ordered_fields`.
  is_match(fuzzy_fields, ordered_fields) {
    const has_ordered = (last_index) => {
      outer:
      for (let i = 0; i <= last_index && i + ordered_fields.length <= this.fields.length; ++i) {
        for (let j = 0; j < ordered_fields.length; ++j) {
          if (this.fields[i + j] !== ordered_fields[j]) {
            continue outer;
          }
        }
        return true;
      }
      return false;
    };

    let last_ordered_start = 0;
    if (fuzzy_fields !== undefined) {
      for (let i = 0; i < fuzzy_fields.length; ++i) {
        let pos = this.fields.indexOf(fuzzy_fields[i]);
        if (pos < 0 || pos >= fuzzy_fields.length) { return false; }
      }
      last_ordered_start = fuzzy_fields.length;
    }
    if (ordered_fields !== undefined) {
      return has_ordered(last_ordered_start);
    }
    return true;
  }
}

class Metadata {
  constructor(conn, dev_mode, done) {
    this._conn = conn;
    this._dev_mode = dev_mode;
    this._ready = false;

    let query =
      r.db('fusion_internal')
       .table('collections')
       .map((row) => [ row('id'), row('indexes') ]).coerceTo('array');

    // If we're in dev mode, add additional steps to ensure dbs and tables exist
    // Note that because of this, it is not safe to run multiple fusion servers in dev mode
    if (this._dev_mode) {
      query = r.expr([ 'fusion', 'fusion_internal' ])
       .forEach((db) => r.branch(r.dbList().contains(db), [], r.dbCreate(db)))
       .do(() =>
         r.expr([ 'collections' ])
          .forEach((table) => r.branch(r.db('fusion_internal').tableList().contains(table),
                                       [], r.db('fusion_internal').tableCreate(table)))
          .do(() => query));
    }

    query.run(this._conn).then(
       (res) => {
         const mapped = res.map((pair) => [ pair[0], new Set(pair[1].map((i) => new Index(i.name, i.fields))) ]);
         this._indexes = new Map(mapped);
         this._ready = true;
         logger.info(`Metadata synced with server, ready for queries.`);
         done();
       }, (err) => done(err));
  }

  is_ready() {
    return this._ready;
  }

  // Returns a matching (compound) index for the given fields
  get_matching_index(table, fuzzy_fields, ordered_fields) {
    let info = this._indexes.get(table);
    if (info === undefined) { throw new TableMissing(table); }

    for (let index of info) {
      if (index.is_match(fuzzy_fields, ordered_fields)) {
        return index;
      }
    }

    throw new IndexMissing(table, fuzzy_fields.concat(ordered_fields));
  }

  handle_error(err, done) {
    logger.debug(`Handling error ${err}, ${err.stack}`);
    try {
      if (this._dev_mode && err.constructor.name === 'TableMissing') {
        this.create_table(err.table, done);
      } else if (this._dev_mode && err.constructor.name === 'IndexMissing') {
        this.create_index(err.table, err.fields, done);
      } else {
        done(err);
      }
    } catch (new_err) {
      logger.debug(`Error when handling error (${err.message}): ${new_err.message}`);
      done(new_err);
    }
  }

  create_index(table, fields, done) {
    logger.info(`Creating index on table "${table}": ${JSON.stringify(fields)}`);
    r.uuid().do((index_id) =>
      r.table(table).indexCreate(index_id, (row) =>
        r.expr(fields).map((field_name) => row(field_name).default(r.minval))
      ).do(() =>
        r.db('fusion_internal').table('collections').get(table).update((row) =>
          ({ indexes: row('indexes').add({ name: index_id, fields }) }))
         .merge({ index_id })))
     .run(this._conn)
     .then((res) => {
       check(!res.skipped, `Table "${table}" was missing from "fusion_internal.collections" when adding an index.`);
       const info = this._indexes.get(table);
       check(info !== undefined, `Table "${table}" was missing from the local metadata when adding an index.`);
       info.add(new Index(res.index_id, fields));
       done();
     }, (err) => done(err)); // TODO: make sure the index is cleaned up on any errors (including the success callback)
  }

  // TODO: consider making table names a uuid as well, to protect against multiple servers in dev mode
  create_table(table, done) {
    // TODO: this is a race condition.  we need a lock on each table/index so we
    // don't try to create it at the same time from multiple places.

    r.tableCreate(table).do(() =>
      r.db('fusion_internal').table('collections').insert(
        { id: table, indexes: [ { name: 'id', fields: [ 'id' ] } ] }))
     .run(this._conn)
     .then((res) => {
       check(res.inserted === 1, `Failed to add "${table}" to "fusion_internal.collections".`);
       check(!this._indexes.has(table), `Table "${table}" was created twice.`);
       this._indexes.set(table, new Set([ new Index('id', [ 'id' ]) ]));
       done();
     }, (err) => done(err));
  }
}

module.exports = { Metadata };
