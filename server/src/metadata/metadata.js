'use strict';

const error = require('../error');
const logger = require('../logger');
const Group = require('../permissions/group').Group;
const Collection = require('./collection').Collection;
const Table = require('./table').Table;
const version_field = require('../endpoint/writes').version_field;

const r = require('rethinkdb');

// These are exported for use by the CLI. They accept 'R' as a parameter because of
// https://github.com/rethinkdb/rethinkdb/issues/3263
const create_collection_reql = (db, collection) =>
  r.db(db).table('hz_collections').get(collection).do((row) =>
    r.branch(
      row.eq(null),
      r.db(db).tableCreate(collection).do((create_res) =>
        r.branch(
          create_res.hasFields('error'),
          r.error(create_res('error')),
          create_res('config_changes')(0)('new_val')('id').do((table_id) =>
            r.db(db).table('hz_collections').get(collection)
              .replace((old_row) =>
                r.branch(
                  old_row.eq(null),
                  { id: collection, table_id },
                  old_row),
                { returnChanges: 'always' })('changes')(0)
                  .do((res) =>
                    r.branch(
                      r.or(res.hasFields('error'),
                           res('new_val')('table_id').ne(table_id)),
                      r.db('rethinkdb').table('table_config').get(table_id).delete().do(() => res),
                      res))))),
      { old_val: row, new_val: row }));

const initialize_metadata_reql = (db) =>
  r.branch(r.dbList().contains(db), null, r.dbCreate(db))
    .do(() =>
      r.expr([ 'hz_collections', 'hz_users_auth', 'hz_groups', 'users' ])
        .forEach((table) => r.branch(r.db(db).tableList().contains(table),
                                     [], r.db(db).tableCreate(table))));

class Metadata {
  constructor(project_name,
              conn,
              clients,
              auto_create_collection,
              auto_create_index) {
    this._db = project_name;
    this._conn = conn;
    this._clients = clients;
    this._auto_create_collection = auto_create_collection;
    this._auto_create_index = auto_create_index;
    this._closed = false;
    this._ready = false;
    this._tables = new Map();
    this._collections = new Map();
    this._groups = new Map();
    this._collection_feed = null;
    this._group_feed = null;
    this._index_feed = null;

    this._ready_promise = Promise.resolve().then(() => {
      logger.debug('checking for internal db/tables');
      if (this._auto_create_collection) {
        return initialize_metadata_reql(this._db).run(this._conn);
      } else {
        return r.dbList().contains(this._db).run(this._conn).then((is_missing_db) => {
          if (is_missing_db) {
            throw new Error(`The database ${this._db} does not exist.  ` +
                            'Run `hz set-schema` to initialize the database, ' +
                            'then start the Horizon server.');
          }
        });
      }
    }).then(() => {
      logger.debug('waiting for internal tables');
      return r.expr([ 'hz_collections', 'hz_users_auth', 'hz_groups', 'users' ])
        .forEach((table) => r.db(this._db).table(table).wait({ timeout: 30 })).run(this._conn);
    }).then(() => {
      logger.debug('syncing metadata changefeeds');

      const group_changefeed =
        r.db(this._db)
          .table('hz_groups')
          .changes({ squash: true,
                     includeInitial: true,
                     includeStates: true,
                     includeTypes: true })
          .run(this._conn).then((res) => {
            if (this._closed) {
              res.close().catch(() => { });
              throw new Error('This metadata instance has been closed.');
            }
            return new Promise((resolve, reject) => {
              this._group_feed = res;
              this._group_feed.eachAsync((change) => {
                if (change.type === 'state') {
                  if (change.state === 'ready') {
                    logger.info('Groups metadata synced.');
                    resolve();
                  }
                } else if (change.type === 'initial' ||
                           change.type === 'add' ||
                           change.type === 'change') {
                  const group = new Group(change.new_val);
                  this._groups.set(group.name, group);
                  this._clients.forEach((c) => c.group_changed(group.name));
                } else if (change.type === 'uninitial' ||
                           change.type === 'remove') {
                  const group = this._groups.delete(change.old_val.id);
                  if (group) {
                    this._clients.forEach((c) => c.group_changed(group.name));
                  }
                }
              }).catch(reject);
            });
          });

      const collection_changefeed =
        r.db(this._db)
          .table('hz_collections')
          .changes({ squash: false,
                     includeInitial: true,
                     includeStates: true,
                     includeTypes: true })
          .run(this._conn).then((res) => {
            if (this._closed) {
              res.close().catch(() => { });
              throw new Error('This metadata instance has been closed.');
            }
            return new Promise((resolve, reject) => {
              this._collection_feed = res;
              this._collection_feed.eachAsync((change) => {
                if (change.type === 'state') {
                  if (change.state === 'ready') {
                    logger.info('Collections metadata synced.');
                    resolve();
                  }
                } else if (change.type === 'initial' ||
                           change.type === 'add' ||
                           change.type === 'change') {
                  // Ignore special collections
                  if (change.new_val.id !== 'users') {
                    const collection_name = change.new_val.id;
                    const table_id = change.new_val.table_id;
                    let collection = this._collections.get(collection_name);
                    if (!collection) {
                      collection = new Collection(collection_name, table_id);
                      this._collections.set(collection_name, collection);
                    }

                    // Check if we already have a table object for this collection
                    // TODO: timer-supervise this state - if we don't have a table after x seconds, delete the collection row
                    const table = this._tables.get(table_id);
                    if (table) {
                      collection.set_table(table);
                    }
                  }
                } else if (change.type === 'uninitial' ||
                           change.type === 'remove') {
                  // Ignore special collections
                  if (change.old_val.id !== 'users') {
                    const collection = this._collections.get(change.old_val.id);
                    this._collections.delete(change.old_val.id);
                    collection.close();
                  }
                }
              }).catch(reject);
            });
          });

      const index_changefeed =
        r.db('rethinkdb')
          .table('table_config')
          .filter((row) => r.and(row('db').eq(this._db),
                                 row('name').match('^hz_').not()))
          .pluck('name', 'id', 'indexes')
          .changes({ squash: true,
                     includeInitial: true,
                     includeStates: true,
                     includeTypes: true })
          .run(this._conn).then((res) => {
            if (this._closed) {
              res.close().catch(() => { });
              throw new Error('This metadata instance has been closed.');
            }
            return new Promise((resolve, reject) => {
              this._index_feed = res;
              this._index_feed.eachAsync((change) => {
                if (change.type === 'state') {
                  if (change.state === 'ready') {
                    logger.info('Index metadata synced.');
                    resolve();
                  }
                } else if (change.type === 'initial' ||
                           change.type === 'add' ||
                           change.type === 'change') {
                  const table_name = change.new_val.name;
                  const table_id = change.new_val.id;
                  let table = this._tables.get(table_id);
                  if (!table) {
                    table = new Table(table_name, table_id, this._db, this._conn);
                    this._tables.set(table_id, table);
                  }
                  table.update_indexes(change.new_val.indexes, this._conn);

                  const collection = this._collections.get(table_name);
                  if (collection) {
                    collection.set_table(table);
                  }
                } else if (change.type === 'uninitial' ||
                           change.type === 'remove') {
                  const table = this._tables.get(change.old_val.id);
                  this._tables.delete(change.old_val.id);
                  table.close();
                }
              }).catch(reject);
            });
          });

      return Promise.all([ group_changefeed, collection_changefeed, index_changefeed ]);
    }).then(() => {
      logger.debug('adding admin user');
      // Ensure that the admin user and group exists
      return Promise.all([
        r.db(this._db).table('users').get('admin')
          .replace((old_row) =>
            r.branch(old_row.eq(null),
              {
                id: 'admin',
                groups: [ 'admin' ],
                [version_field]: 0,
              },
              old_row),
            { returnChanges: 'always' })('changes')(0)
          .do((res) =>
            r.branch(res('new_val').eq(null),
                     r.error(res('error')),
                     res('new_val'))).run(this._conn),
        r.db(this._db).table('hz_groups').get('admin')
          .replace((old_row) =>
            r.branch(old_row.eq(null),
              {
                id: 'admin',
                rules: { carte_blanche: { template: 'any()' } },
                [version_field]: 0,
              },
              old_row),
            { returnChanges: 'always' })('changes')(0)
          .do((res) =>
            r.branch(res('new_val').eq(null),
                     r.error(res('error')),
                     res('new_val'))).run(this._conn),
      ]);
    }).then(() =>
      // Get the table_id of the users table
      r.db('rethinkdb').table('table_config')
        .filter({ db: this._db, name: 'users' })
        .nth(0)('id')
        .run(this._conn)
    ).then((table_id) => {
      logger.debug('redirecting users table');
      // Redirect the 'users' table to the one in the internal db
      const users_table = new Table('users', table_id, this._db, this._conn);
      const users_collection = new Collection('users', table_id);

      users_collection.set_table(users_table);

      this._tables.set(table_id, users_table);
      this._collections.set('users', users_collection);
    }).then(() => {
      logger.debug('metadata sync complete');
      this._ready = true;
      return this;
    });

    this._ready_promise.catch(() => {
      this.close();
    });
  }

  close() {
    this._closed = true;
    this._ready = false;

    if (this._group_feed) {
      this._group_feed.close().catch(() => { });
    }
    if (this._collection_feed) {
      this._collection_feed.close().catch(() => { });
    }
    if (this._index_feed) {
      this._index_feed.close().catch(() => { });
    }

    this._collections.forEach((x) => x.close());
    this._collections.clear();

    this._tables.forEach((x) => x.close());
    this._tables.clear();
  }

  is_ready() {
    return this._ready;
  }

  ready() {
    return this._ready_promise;
  }

  collection(name) {
    if (name.indexOf('hz_') === 0) {
      throw new Error(`Collection "${name}" is reserved for internal use ` +
                      'and cannot be used in requests.');
    }

    const res = this._collections.get(name);
    if (res === undefined) { throw new error.CollectionMissing(name); }
    if (res.promise) { throw new error.CollectionNotReady(res); }
    if (!res._table) { throw new error.CollectionNotReady(res); }
    return res;
  }

  handle_error(err, done) {
    logger.debug(`Handling error: ${err.message}`);
    try {
      if (this._auto_create_collection) {
        if (err instanceof error.CollectionMissing) {
          logger.warn(`Auto-creating collection: ${err.name}`);
          return this.create_collection(err.name, done);
        } else if (err instanceof error.CollectionNotReady) {
          return err.collection.on_ready(done);
        }
      }
      if (this._auto_create_index) {
        if (err instanceof error.IndexMissing) {
          logger.warn(`Auto-creating index on collection "${err.collection.name}": ` +
                      `${JSON.stringify(err.fields)}`);
          return err.collection.create_index(err.fields, this._conn, done);
        } else if (err instanceof error.IndexNotReady) {
          return err.index.on_ready(done);
        }
      }
      done(err);
    } catch (new_err) {
      logger.debug(`Error when handling error: ${new_err.message}`);
      done(new_err);
    }
  }

  create_collection(name, done) {
    error.check(this._collections.get(name) === undefined,
                `Collection "${name}" already exists.`);

    // We don't have the collection's table id yet, so pass null down until we get
    // notified by the index_changefeed about the new table.
    const collection = new Collection(name, null);
    this._collections.set(name, collection);

    create_collection_reql(this._db, name)
      .run(this._conn)
      .then((res) => {
        error.check(!res.error, `Collection creation failed: "${name}", ${res.error}`);
        logger.warn(`Collection created: "${name}"`);
        collection.on_ready(done);
      }).catch((err) => {
        // If an error occurred we should clean up this proto-collection - but only if
        // it hasn't changed yet - e.g. it was created by another instance at the same time.
        if (collection._table_name === null) {
          collection.close();
          this._collections.delete(name);
        }
        done(err);
      });
  }

  get_user_feed(id) {
    return r.db(this._db).table('users').get(id)
      .changes({ includeInitial: true, squash: true })
      .run(this._conn);
  }

  get_group(group_name) {
    return this._groups.get(group_name);
  }

  connection() {
    return this._conn;
  }
}

module.exports = { Metadata, create_collection_reql, initialize_metadata_reql };
