'use strict';

const check = require('./error').check;
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
  constructor(name) {
    super(`Table "${name}" does not exist.`);
    this.name = name;
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

class Index {
  constructor(name, fields, promise) {
    this.name = name;
    this.fields = fields;
    this.promise = promise;
  }

  on_ready(done) {
    this.promise ? this.promise.then(() => done(), (err) => done(err)) : done();
  }

  // `fuzzy_fields` may be in any order at the beginning of the index.
  // These must be immediately followed by `ordered_fields` in the exact
  // order given.  There may be no other fields present in the index until
  // after all of `fuzzy_fields` and `ordered_fields` are present.
  // `fuzzy_fields` may overlap with `ordered_fields`.
  is_match(fuzzy_fields, ordered_fields) {
    for (let i = 0; i < fuzzy_fields.length; ++i) {
      const pos = this.fields.indexOf(fuzzy_fields[i]);
      if (pos < 0 || pos >= fuzzy_fields.length) { return false; }
    }

    outer: // eslint-disable-line no-labels
    for (let i = 0; i <= fuzzy_fields.length && i + ordered_fields.length <= this.fields.length; ++i) {
      for (let j = 0; j < ordered_fields.length; ++j) {
        if (this.fields[i + j] !== ordered_fields[j]) {
          continue outer; // eslint-disable-line no-labels
        }
      }
      return true;
    }
    return false;
  }
}

class Table {
  constructor(name, indexes, promise) {
    this.name = name;
    this.indexes = indexes;
    this.promise = promise;
  }

  on_ready(done) {
    this.promise ? this.promise.then(() => done(), (err) => done(err)) : done();
  }

  create_index(fields, conn, done) {
    logger.warn(`Auto-creating index on table "${this.name}" (dev mode): ${JSON.stringify(fields)}`);

    // This may error if two dev mode instances try to create the table at the
    // same time on multiple instances.  This could maybe be mitigated by adding
    // a delay before `r.tableWait` below - but the time would depend on the
    // latency of metadata propagation in the RethinkDB cluster.
    const promise =
      r.uuid(r.expr(fields).toJSON()).do((index_id) =>
        r.db('horizon_internal').table('collections').get(this.name).update((row) =>
          ({ indexes: r.object(index_id, fields).merge(row('indexes')) })).do((res) =>
          r.branch(res('replaced').eq(1),
            r.table(this.name).indexCreate(index_id, (row) =>
              r.expr(fields).map((field_name) => row(field_name).default(r.minval))),
            { }).do((res2) => [
              res2.merge({ index_id }),
              r.table(this.name).indexWait(index_id),
            ]))).nth(0)
       .run(conn);

    const index = new Index('uninitialized', fields, promise);
    this.indexes.add(index);

    promise.then((res) => {
      if (res.created) {
        logger.warn(`Index ${JSON.stringify(fields)} on table "${this.name}" created.`);
      } else {
        logger.warn(`Index ${JSON.stringify(fields)} on table "${this.name}" created elsewhere.`);
      }
      index.name = res.index_id;
      index.promise = undefined;
      done();
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

class Metadata {
  constructor(conn, auto_create_table, auto_create_index) {
    this._conn = conn;
    this._auto_create_table = auto_create_table;
    this._auto_create_index = auto_create_index;
    this._ready = false;

    let createIndex = (db, table, index, expr) =>
      r.branch(
        r.db(db).table(table).indexList().contains(index), r.expr(true),
        r.db(db).table(table).indexCreate(index, expr));

    let query =
      r.db('horizon_internal')
       .table('collections')
       .map((row) => ({ name: row('id'), indexes: row('indexes') })).coerceTo('array');

    // If we're in dev mode, add additional steps to ensure dbs and tables exist
    // Note that because of this, it is not safe to run multiple horizon servers in dev mode
    if (this._auto_create_table) {
      query = r.expr([ 'horizon', 'horizon_internal' ])
       .forEach((db) => r.branch(r.dbList().contains(db), [], r.dbCreate(db)))
       .do(() =>
         r.expr([ 'collections', 'users_auth', 'users', 'stats_clients', 'stats_requests' ])
          .forEach((table) => r.branch(r.db('horizon_internal').tableList().contains(table),
                                       [], r.db('horizon_internal').tableCreate(table)))
          .do(() => r.expr([
            createIndex('horizon_internal', 'stats_clients', 'connected'),
            createIndex('horizon_internal', 'stats_requests', 'time'),
            createIndex('horizon_internal', 'stats_requests', 'cursors',
                        row => row('cursors').gt(0))
          ]))
          .do(() => query));
    }

    logger.info('running metadata sync');
    this._ready_promise = query.run(this._conn).then((res) => {
      logger.info('metadata sync complete');
      this._tables = new Map();
      res.forEach((table) =>
        this._tables.set(table.name,
          new Table(table.name,
            new Set(Object.keys(table.indexes).map((idx) =>
              new Index(idx, table.indexes[idx]))))));
      this._ready = true;
    }).then(() => this);
  }

  is_ready() {
    return this._ready;
  }

  ready() {
    return this._ready_promise;
  }

  get_table(name) {
    const table = this._tables.get(name);
    if (table === undefined) { throw new TableMissing(name); }
    if (table.promise !== undefined) { throw new TableNotReady(table); }
    return table;
  }

  handle_error(err, done) {
    logger.debug(`Handling error: ${err.message}`);
    try {
      if (this._auto_create_table) {
        if (err.constructor.name === 'TableMissing') {
          return this.create_table(err.name, done);
        } else if (err.constructor.name === 'TableNotReady') {
          return err.table.on_ready(done);
        }
      }
      if (this._auto_create_index) {
        if (err.constructor.name === 'IndexMissing') {
          return err.table.create_index(err.fields, this._conn, done);
        } else if (err.constructor.name === 'IndexNotReady') {
          return err.index.on_ready(done);
        }
      }
      done(err);
    } catch (new_err) {
      logger.debug(`Error when handling error: ${new_err.message}`);
      done(new_err);
    }
  }

  create_table(name, done) {
    logger.warn(`Auto-creating table (dev mode): "${name}"`);
    check(this._tables.get(name) === undefined, `Table "${name}" already exists.`);

    // This may error if two dev mode instances try to create the table at the
    // same time on multiple instances.  This could maybe be mitigated by adding
    // a delay before `r.tableWait` below - but the time would depend on the
    // latency of metadata propagation in the RethinkDB cluster.
    const promise =
      r.db('horizon_internal').table('collections').insert(
        { id: name, indexes: { id: [ 'id' ] } }).do((res) =>
          r.branch(res('inserted').eq(1),
                   r.tableCreate(name),
                   r.table(name).wait()))
       .run(this._conn);

    const table = new Table(name, new Set([ new Index('id', [ 'id' ]) ]), promise);
    this._tables.set(name, table);

    promise.then((res) => {
      if (res.tables_created) {
        logger.warn(`Table "${name}" created.`);
      } else {
        logger.warn(`Table "${name}" created elsewhere.`);
      }
      table.promise = undefined;
      done();
    }, (err) => {
      this._tables.delete(name);
      done(err);
    });
  }

  get_user_info(id, done) {
    r.db('horizon_internal').table('users').get(id).run(this._conn, done);
  }
}

module.exports = { Metadata };
