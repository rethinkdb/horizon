'use strict';

const error = require('./error');
const logger = require('./logger');
const Group = require('./permissions/group').Group;
const Collection = require('./collection').Collection;

const r = require('rethinkdb');

const user_data_db = 'horizon';
const internal_db = user_data_db + '_internal';

class Metadata {
  constructor(conn, clients, auto_create_collection, auto_create_index) {
    this._conn = conn;
    this._clients = clients;
    this._auto_create_collection = auto_create_collection;
    this._auto_create_index = auto_create_index;
    this._ready = false;
    this._collections = new Map();
    this._groups = new Map();
    this._collection_feed = null;
    this._group_feed = null;
    this._index_feed = null;

    const make_feeds = () => {
      logger.info('running metadata sync');
      const groups_ready = new Promise((resolve, reject) => {
        r.db(internal_db)
          .table('groups')
          .changes({ squash: true,
                     includeInitial: true,
                     includeStates: true,
                     includeTypes: true })
          .run(this._conn).then((res) => {
            this._group_feed = res;
            this._group_feed.asyncEach((change) => {
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
            });
          }).catch(reject);
      });
      const collections_ready = new Promise((resolve, reject) => {
        r.db(internal_db)
          .table('collections')
          .changes({ squash: true,
                     includeInitial: true,
                     includeStates: true,
                     includeTypes: true })
          .run(this._conn).then((res) => {
            this._collection_feed = res;
            this._collection_feed.asyncEach((change) => {
              if (change.type === 'state') {
                if (change.state === 'ready') {
                  logger.info('Collections metadata synced.');
                  resolve();
                }
              } else if (change.type === 'initial' ||
                         change.type === 'add' ||
                         change.type === 'change') {
                const collection = new Collection(change.new_val);
                this._collections.set(collection.name, collection);
              } else if (change.type === 'uninitial' ||
                         change.type === 'remove') {
                this._collections.delete(change.old_val.id);
              }
            });
          }).catch(reject);
      });
      const indexes_ready = new Promise((resolve, reject) => {
        r.db('rethinkdb')
          .table('table_config')
          .filter({ db: user_data_db })
          .pluck('name', 'indexes')
          .changes({ squash: true,
                     includeInitial: true,
                     includeState: true,
                     includeTypes: true })
          .run(this._conn).then((res) => {
            this._index_feed = res;
            this._index_feed.asyncEach((change) => {
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
            });
          }).catch(reject);
      });
      return Promise.all(groups_ready, collections_ready, indexes_ready).then(() => {
        logger.info('metadata sync complete');
        return this;
      });
    };

    if (this._auto_create_collection) {
      this._ready_promise =
        r.expr([ user_data_db, internal_db ])
         .forEach((db) => r.branch(r.dbList().contains(db), [], r.dbCreate(db)))
         .do(() =>
           r.expr([ 'collections', 'users_auth', 'users', 'groups' ])
            .forEach((table) => r.branch(r.db(internal_db).tableList().contains(table),
                                         [], r.db(internal_db).tableCreate(table))))
         .run(this._conn).then(make_feeds);
    } else {
      this._ready_promise = make_feeds();
    }
  }

  close() {
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

  get_collection(name) {
    const collection = this._collections.get(name);
    if (collection === undefined) { throw new error.CollectionMissing(name); }
    if (collection.promise !== undefined) { throw new error.CollectionNotReady(collection); }
    return collection;
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

    const do_create = (table) =>
      r.db(user_data_db).tableCreate(table).do(() =>
        r.db(internal_db)
          .table('collections')
          .get(name)
          .replace((old_row) =>
            r.branch(old_row.eq(null),
                     { id: name, table },
                     old_row),
            { returnChanges: 'always' })('changes')(0)('new_val').do((res) =>
            r.branch(res('table').ne(table),
                     r.db(user_data_db).tableDrop(table).do(() => res),
                     res)));

    r.uuid().do((id) => name.add('_').add(id)).do((table) =>
      r.db(internal_db).table('collections').get(name).do((row) =>
        r.branch(row.eq(null),
                 do_create(table),
                 row)))
      .run(this._conn)
      .then((res) => {
        logger.warn(`Collection created (dev mode): "${name}"`);
        this._collections.set(name, new Collection(res, this._conn));
        done();
      }).catch(done);
  }

  get_user_feed(id, done) {
    r.db(internal_db)
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

module.exports = { Metadata };
