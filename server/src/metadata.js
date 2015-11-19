'use strict';

const { check } = require('./error');
const logger = require('./logger');

const r = require('rethinkdb');

class IndexMissing extends Error {
  constructor(table, fields) {
    super(`Table "${table.name}" has no index matching ${JSON.stringify(fields)}.`);
    this.table = table;
    this.fields = fields;
  }
}

class TableMissing extends Error {
  constructor(table) {
    super(`Table "${table.name}" does not exist.`);
    this.table = table;
  }
}

class IndexNotReady extends Error {
  constructor(table, index) {
    super(`Index on table "${table.name}" is not ready: ${JSON.stringify(index.fields)}.`);
    this.table = table;
    this.index = index;
  }
}

class TableNotReady extends Error {
  constructor(table) {
    super(`Table "${table.name}" is not ready.`);
    this.table = table;
  }
}

class Table {
  constructor(name, indexes, promise) {
    this.name = name;
    this.indexes = indexes;
    this.promise = promise;
  }

  on_ready(done) {
    this.promise ? this.promise.then((res) => done(), (err) => done(err)) : done();
  }

  create_index(fields, conn, done) {
    logger.warn(`Auto-creating index on table "${this.name}" (dev mode): "${JSON.stringify(fields)}"`);

    const promise =
      r.uuid().do((index_id) =>
        r.table(this.name).indexCreate(index_id, (row) =>
          r.expr(fields).map((field_name) => row(field_name).default(r.minval))
        ).do(() =>
          r.db('fusion_internal').table('collections').get(this.name).update((row) =>
            ({ indexes: row('indexes').add({ name: index_id, fields }) }))
           .merge({ index_id })
           .do((res) => r.table(this.name).indexWait(index_id).do(() => res))))
       .run(conn);

    const index = new Index('uninitialized', fields, promise);
    this.indexes.add(index);

    promise.then((res) => {
      if (res.skipped) {
        this.indexes.delete(index);
        done(new Error(`Table "${this.name}" was missing in the database when adding an index.`));
      } else {
        index.name = res.index_id;
        index.promise = undefined;
        done();
      }
    }, (err) => {
      this.indexes.delete(index);
      done(err);
    });
  }

  // Returns a matching (possibly compound) index for the given fields
  // fuzzy_fields and ordered_fields should both be arrays
  get_matching_index(fuzzy_fields, ordered_fields) {
    let match = undefined;
    for (let index of this.indexes) {
      if (index.is_match(fuzzy_fields, ordered_fields)) {
        if (index.promise === undefined) {
          return index;
        } else if (match === undefined) {
          match = index;
        }
      }
    }

    if (match === undefined) {
      throw new IndexMissing(this, fuzzy_fields.concat(ordered_fields));
    } else {
      throw new IndexNotReady(this, match);
    }
  }
}

class Index {
  constructor(name, fields, promise) {
    this.name = name;
    this.fields = fields;
    this.promise = promise;
  }

  on_ready(done) {
    this.promise ? this.promise.then((res) => done(), (err) => done(err)) : done();
  }

  // `fuzzy_fields` may be in any order at the beginning of the index.
  // These must be immediately followed by `ordered_fields` in the exact
  // order given.  There may be no other fields present in the index until
  // after all of `fuzzy_fields` and `ordered_fields` are present.
  // `fuzzy_fields` may overlap with `ordered_fields`.
  is_match(fuzzy_fields, ordered_fields) {
    for (let i = 0; i < fuzzy_fields.length; ++i) {
      let pos = this.fields.indexOf(fuzzy_fields[i]);
      if (pos < 0 || pos >= fuzzy_fields.length) { return false; }
    }

    outer:
    for (let i = 0; i <= fuzzy_fields.length && i + ordered_fields.length <= this.fields.length; ++i) {
      for (let j = 0; j < ordered_fields.length; ++j) {
        if (this.fields[i + j] !== ordered_fields[j]) {
          continue outer;
        }
      }
      return true;
    }
    return false;
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
       .map((row) => ({ name: row('id'), indexes: row('indexes') })).coerceTo('array');

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

    query.run(this._conn).then((res) => {
      this._ready = true;
      this._tables = new Map();
      res.forEach((table) =>
        this._tables.set(table.name,
          new Table(table.name,
            new Set(table.indexes.map((idx) =>
              new Index(idx.name, idx.fields))))));
      logger.info(`Metadata synced with server, ready for queries.`);
      done();
    }, (err) => done(err));
  }

  is_ready() {
    return this._ready;
  }

  get_table(name) {
    const table = this._tables.get(name);
    if (table === undefined) { throw new TableMissing(name); }
    if (table.promise !== undefined) { throw new TableNotReady(table); }
    return table;
  }

  handle_error(err, done) {
    logger.debug(`Handling error ${err}, ${err.stack}`);
    try {
      if (this._dev_mode) {
        if (err.constructor.name === 'TableMissing') {
          return this.create_table(err.table, done);
        } else if (err.constructor.name === 'TableNotReady') {
          return err.table.on_ready(done);
        } else if (err.constructor.name === 'IndexMissing') {
          return err.table.create_index(err.fields, this._conn, done);
        } else if (err.constructor.name === 'IndexNotReady') {
          return err.index.on_ready(done);
        }
      }
    } catch (new_err) {
      logger.debug(`Error when handling error (${err.message}): ${new_err.message}`);
      done(new_err);
    }
    done(err);
  }

  create_table(name, done) {
    logger.warn(`Auto-creating table (dev mode): "${name}"`);
    check(this._tables.get(name) === undefined, `Table "${name}" already exists.`);

    const promise =
      r.tableCreate(name).do(() =>
        r.db('fusion_internal').table('collections').insert(
          { id: name, indexes: [ { name: 'id', fields: [ 'id' ] } ] }))
       .run(this._conn)

    const table = new Table(name, new Set([ new Index('id', [ 'id' ]) ]), promise);
    this._tables.set(name, table);

    promise.then((res) => {
      if (!res.inserted) {
        done(new Error(`Failed to add "${name}" to "fusion_internal".`));
      } else {
        table.promise = undefined;
        done();
      }
    }, (err) => {
      this._tables.delete(name);
      done(err);
    });
  }
}

module.exports = { Metadata };
