'use strict';

const error = require('../error');
const logger = require('../logger');
const Group = require('../permissions/group').Group;
const Collection = require('./collection').Collection;
const version_field = require('../endpoint/writes').version_field;
const utils = require('../utils');

const r = require('rethinkdb');

const metadata_version = [ 2, 0, 0 ];

const create_collection = (db, name, conn) =>
  r.db(db).table('hz_collections').get(name).replace({ id: name }).do((res) =>
    r.branch(
      res('errors').ne(0),
      r.error(res('first_error')),
      res('inserted').eq(1),
      r.db(db).tableCreate(name),
      res
    )
  ).run(conn);

const initialize_metadata = (db, conn) =>
  r.branch(r.dbList().contains(db), null, r.dbCreate(db)).run(conn)
    .then(() =>
      Promise.all([ 'hz_collections', 'hz_users_auth', 'hz_groups' ].map((table) =>
        r.branch(r.db(db).tableList().contains(table),
                 { },
                 r.db(db).tableCreate(table))
          .run(conn))))
    .then(() =>
      r.db(db).table('hz_collections').wait({ timeout: 30 }).run(conn))
    .then(() =>
      Promise.all([
        r.db(db).tableList().contains('users').not().run(conn).then(() =>
          create_collection(db, 'users', conn)),
        r.db(db).table('hz_collections')
          .insert({ id: 'hz_metadata', version: metadata_version })
          .run(conn),
      ])
    );

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
    this._collections = new Map();
    this._groups = new Map();
    this._collection_feed = null;
    this._group_feed = null;
    this._index_feed = null;

    this._ready_promise = Promise.resolve().then(() => {
      logger.debug('checking rethinkdb version');
      return r.db('rethinkdb').table('server_status').nth(0)('process')('version').run(this._conn)
               .then((res) => utils.rethinkdb_version_check(res));
    }).then(() => {
      const old_metadata_db = `${this._db}_internal`;
      return r.dbList().contains(old_metadata_db).run(this._conn).then((has_old_db) => {
        if (has_old_db) {
          throw new Error('The Horizon metadata appears to be from v1.x because ' +
                          `the "${old_metadata_db}" database exists.  Please use ` +
                          '`hz migrate` to convert your metadata to the new format.');
        }
      });
    }).then(() => {
      logger.debug('checking for internal tables');
      if (this._auto_create_collection) {
        return initialize_metadata(this._db, this._conn);
      } else {
        return r.dbList().contains(this._db).run(this._conn).then((has_db) => {
          if (!has_db) {
            throw new Error(`The database ${this._db} does not exist.  ` +
                            'Run `hz schema apply` to initialize the database, ' +
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
                  this._groups.delete(change.old_val.id);
                  this._clients.forEach((c) => c.group_changed(change.old_val.id));
                }
              }).catch(reject);
            });
          });

      const collection_changefeed =
        r.db(this._db)
          .table('hz_collections')
          .filter((row) => row('id').match('^hz_').not())
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
                  const collection_name = change.new_val.id;
                  let collection = this._collections.get(collection_name);
                  if (!collection) {
                    collection = new Collection(this._db, collection_name);
                    this._collections.set(collection_name, collection);
                  }
                  collection._register();
                } else if (change.type === 'uninitial' ||
                           change.type === 'remove') {
                  const collection = this._collections.get(change.old_val.id);
                  if (collection) {
                    collection._unregister();
                    if (collection._is_safe_to_remove()) {
                      this._collections.delete(change.old_val.id);
                      collection._close();
                    }
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
          .map((row) => ({
            id: row('id'),
            name: row('name'),
            indexes: row('indexes').filter((idx) => idx.match('^hz_')),
          }))
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
                  const collection_name = change.new_val.name;
                  const table_id = change.new_val.id;

                  let collection = this._collections.get(collection_name);
                  if (!collection) {
                    collection = new Collection(this._db, collection_name);
                    this._collections.set(collection_name, collection);
                  }
                  collection._update_table(table_id, change.new_val.indexes, this._conn);
                } else if (change.type === 'uninitial' ||
                           change.type === 'remove') {
                  const collection = this._collections.get(change.old_val.name);
                  if (collection) {
                    collection._update_table(change.old_val.id, null, this._conn);
                    if (collection._is_safe_to_remove()) {
                      this._collections.delete(collection);
                      collection._close();
                    }
                  }
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

    this._collections.forEach((collection) => collection._close());
    this._collections.clear();
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

    const collection = this._collections.get(name);
    if (collection === undefined) { throw new error.CollectionMissing(name); }
    if (!collection._get_table().ready()) { throw new error.CollectionNotReady(collection); }
    return collection;
  }

  handle_error(err, done) {
    logger.debug(`Handling error: ${err.message}`);
    try {
      if (err instanceof error.CollectionNotReady) {
        return err.collection._on_ready(done);
      } else if (err instanceof error.IndexNotReady) {
        return err.index.on_ready(done);
      } else if (this._auto_create_collection && (err instanceof error.CollectionMissing)) {
        logger.warn(`Auto-creating collection: ${err.name}`);
        return this.create_collection(err.name, done);
      } else if (this._auto_create_index && (err instanceof error.IndexMissing)) {
        logger.warn(`Auto-creating index on collection "${err.collection.name}": ` +
                    `${JSON.stringify(err.fields)}`);
        return err.collection._create_index(err.fields, this._conn, done);
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

    const collection = new Collection(this._db, name);
    this._collections.set(name, collection);

    create_collection(this._db, name, this._conn).then((res) => {
      error.check(!res.error, `Collection "${name}" creation failed: ${res.error}`);
      logger.warn(`Collection created: "${name}"`);
      collection._on_ready(done);
    }).catch((err) => {
      if (collection._is_safe_to_remove()) {
        this._collections.delete(name);
        collection._close();
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

module.exports = { Metadata, create_collection, initialize_metadata };
