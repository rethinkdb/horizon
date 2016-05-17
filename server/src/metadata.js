'use strict';

const error = require('./error');
const logger = require('./logger');
const Group = require('./permissions/group').Group;
const Collection = require('./collection').Collection;

const r = require('rethinkdb');

// These are exported for use by the CLI. They accept 'R' as a parameter because of
// https://github.com/rethinkdb/rethinkdb/issues/3263
const create_collection_reql = (R, internal_db, user_db, collection) => {
  const do_create = (table) =>
    R.db(user_db).tableCreate(table).do(() =>
      R.db(internal_db)
        .table('collections')
        .get(collection)
        .replace((old_row) =>
          R.branch(old_row.eq(null),
                   { id: collection, table },
                   old_row),
          { returnChanges: 'always' })('changes')(0)
        .do((res) =>
          R.branch(R.or(res.hasFields('error'),
                        res('new_val')('table').ne(table)),
                   R.db(user_db).tableDrop(table).do(() => res),
                   res)));

  return R.uuid().split('-')(-1)
           .do((id) => R.expr(collection).add('_').add(id)).do((table) =>
             R.db(internal_db).table('collections').get(collection).do((row) =>
               R.branch(row.eq(null),
                        do_create(table),
                        { old_val: row, new_val: row })));
};
const initialize_metadata_reql = (R, internal_db, user_db) => {
  return R.expr([ user_db, internal_db ])
          .forEach((db) => R.branch(R.dbList().contains(db), [], R.dbCreate(db)))
          .do(() =>
            R.expr([ 'collections', 'users_auth', 'users', 'groups' ])
             .forEach((table) => R.branch(R.db(internal_db).tableList().contains(table),
                                          [], R.db(internal_db).tableCreate(table))));
};

class Metadata {
  constructor(project_name,
              conn,
              clients,
              auto_create_collection,
              auto_create_index) {
    this._db = project_name;
    this._internal_db = `${this._db}_internal`;
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

    const make_feeds = () => {
      logger.debug('running metadata sync');
      const groups_ready =
        r.db(this._internal_db)
          .table('groups')
          .changes({ squash: true,
                     includeInitial: true,
                     includeStates: true,
                     includeTypes: true })
          .run(this._conn).then((res) => {
            if (this._closed) {
              res.close();
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
      const collections_ready =
        r.db(this._internal_db)
          .table('collections')
          .changes({ squash: true,
                     includeInitial: true,
                     includeStates: true,
                     includeTypes: true })
          .run(this._conn).then((res) => {
            if (this._closed) {
              res.close();
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
                    const collection = new Collection(change.new_val, this._db, this._conn);
                    this._collections.set(collection.name, collection);
                  }
                } else if (change.type === 'uninitial' ||
                           change.type === 'remove') {
                  // Ignore special collections
                  if (change.old_val.id !== 'users') {
                    this._collections.delete(change.old_val.id);
                  }
                }
              }).catch(reject);
            });
          });
      const indexes_ready =
        r.db('rethinkdb')
          .table('table_config')
          .filter({ db: this._db })
          .pluck('name', 'indexes')
          .changes({ squash: true,
                     includeInitial: true,
                     includeStates: true,
                     includeTypes: true })
          .run(this._conn).then((res) => {
            if (this._closed) {
              res.close();
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
                  const table = change.new_val.name;
                  this._collections.forEach((c) => {
                    if (c.table === table) {
                      c.update_indexes(change.new_val.indexes, this._conn);
                    }
                  });
                }
              }).catch(reject);
            });
          })
      return Promise.all([ groups_ready, collections_ready, indexes_ready ]);
    };

    if (this._auto_create_collection) {
      this._ready_promise =
        initialize_metadata_reql(r, this._internal_db, this._db).run(this._conn).then(make_feeds);
    } else {
      this._ready_promise =
        r.expr([ this._db, this._internal_db ])
         .concatMap((db) => r.branch(r.dbList().contains(db), [], [db]))
         .run(this._conn).then((missing_dbs) => {
           logger.debug("checking for internal db/tables");
           if (missing_dbs.length > 0) {
             let err_msg;
             if (missing_dbs.length == 1) {
               err_msg = "The database " + missing_dbs[0] + " doesn't exist. ";
             } else {
               err_msg = "The databases " + missing_dbs[0] + " and " + missing_dbs[1] + " don't exist. ";
             }
             throw new Error(err_msg + "Run `hz set-schema` to initialize the database, "
                  + "then start the Horizon server.");
           } else {
             return make_feeds();
           }
         });
    }

    this._ready_promise = this._ready_promise.then(() => {
      logger.debug('adding admin user');
      // Ensure that the admin user and group exists
      return Promise.all([
        r.db(this._internal_db).table('users').get('admin')
          .replace((old_row) =>
            r.branch(old_row.eq(null),
                     { id: 'admin', groups: [ 'admin' ] },
                     old_row),
            { returnChanges: 'always' })('changes')(0)
          .do((res) =>
            r.branch(res('new_val').eq(null),
                     r.error(res('error')),
                     res('new_val'))).run(this._conn),
        r.db(this._internal_db).table('groups').get('admin')
          .replace((old_row) =>
            r.branch(old_row.eq(null),
                     { id: 'admin', rules: { 'carte_blanche': { 'template': 'any()' } } },
                     old_row),
            { returnChanges: 'always' })('changes')(0)
          .do((res) =>
            r.branch(res('new_val').eq(null),
                     r.error(res('error')),
                     res('new_val'))).run(this._conn)
      ]);
    }).then(() => {
      logger.debug('redirecting users table');
      // Redirect the 'users' table to the one in the internal db
      this._collections.set('users', new Collection({ id: 'users', table: 'users' },
                                                    this._internal_db, this._conn));
    }).then(() => {
      logger.debug('metadata sync complete');
      this._ready = true;
      return this;
    });

    this._ready_promise.catch(() => {
      this.close();
      throw e;
    });
  }

  close() {
    this._closed = true;
    this._ready = false;
    if (this._group_feed) {
      this._group_feed.close();
    }
    if (this._collection_feed) {
      this._collection_feed.close();
    }
    if (this._index_feed) {
      this._index_feed.close();
    }
  }

  is_ready() {
    return this._ready;
  }

  ready() {
    return this._ready_promise;
  }

  collection(name) {
    const res = this._collections.get(name);
    if (res === undefined) { throw new error.CollectionMissing(name); }
    if (res.promise) { throw new error.CollectionNotReady(res); }
    return res;
  }

  handle_error(err, done) {
    logger.debug(`Handling error: ${err.message}`);
    try {
      if (this._auto_create_collection) {
        if (err instanceof error.CollectionMissing) {
          logger.warn(`Auto-creating collection (dev mode): ${err.name}`);
          return this.create_collection(err.name, done);
        } else if (err instanceof error.CollectionNotReady) {
          return err.collection.on_ready(done);
        }
      }
      if (this._auto_create_index) {
        if (err instanceof error.IndexMissing) {
          logger.warn(`Auto-creating index on collection "${err.collection.name}" ` +
                      `(dev mode): ${JSON.stringify(err.fields)}`);
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

    create_collection_reql(r, this._internal_db, this._db, name)
      .run(this._conn)
      .then((res) => {
        error.check(!res.error, `Collection creation failed (dev mode): "${name}", ${res.error}`);
        logger.warn(`Collection created (dev mode): "${name}"`);
        this._collections.set(name, new Collection(res.new_val, this._db, this._conn));
        done();
      }).catch(done);
  }

  get_user_feed(id, done) {
    r.db(this._internal_db)
      .table('users')
      .get(id)
      .changes({ includeInitial: true, squash: true })
      .run(this._conn, done);
  }

  get_group(group_name) {
    return this._groups.get(group_name);
  }

  connection() {
    return this._conn;
  }
}

module.exports = { Metadata, create_collection_reql, initialize_metadata_reql };
