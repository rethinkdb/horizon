'use strict';

const queries = require('../queries');
const Collection = require('./collection');

const assert = require('assert');

const {
  Reliable,
  ReliableUnion,
  ReliableChangefeed,
} = require('@horizon/server');

const {rethinkdbVersionCheck} = require('@horizon/plugin-utils');

class StaleAttemptError extends Error { }

// RSI: fix all this shit.
class ReliableInit extends Reliable {
  constructor(context, autoCreateCollection, log) {
    super(context);
    this.log = log;
    this.context = context;
    this.autoCreateCollection = autoCreateCollection;
    this.connSubs = this.context.horizon.reliableConn.subscribe({
      onReady: (conn) => {
        this.currentAttempt = Symbol();
        this.doInit(conn, this.currentAttempt);
      },
      onUnready: () => {
        this.currentAttempt = null;
        if (this.ready) {
          this.emit('onUnready');
        }
      },
    });
  }

  checkAttempt(attempt) {
    if (attempt !== this.currentAttempt) {
      throw new StaleAttemptError();
    }
  }

  doInit(conn, attempt) {
    const r = this.context.horizon.r;
    const db = this.context.horizon.options.projectName;
    Promise.resolve().then(() => {
      this.checkAttempt(attempt);
      return r.db('rethinkdb').table('server_status')
              .nth(0)('process')('version').run(conn);
    }).then((version) => {
      this.checkAttempt(attempt);
      rethinkdbVersionCheck(version);
      this.log('debug', 'checking for old metadata version');
      const oldMetadataDb = `${db}_internal`;
      return r.dbList().contains(oldMetadataDb).run(conn).then((hasOldDb) => {
        if (hasOldDb) {
          throw new Error('The Horizon metadata appears to be from v1.x because ' +
                          `the "${oldMetadataDb}" database exists.  Please use ` +
                          '`hz migrate` to convert your metadata to the new format.');
        }
      });
    }).then(() => {
      this.checkAttempt(attempt);
      this.log('debug', 'checking for internal tables');
      if (this.autoCreateCollection) {
        return queries.initializeMetadata(this.context);
      } else {
        return r.dbList().contains(db).run(conn).then((hasDb) => {
          if (!hasDb) {
            // RSI: schema-apply needs to be a plugin
            throw new Error(`The database ${db} does not exist.  ` +
                            'Run `hz schema apply` to initialize the database, ' +
                            'then start the Horizon server.');
          }
        });
      }
    }).then(() => {
      this.checkAttempt(attempt);
      this.log('debug', 'waiting for internal tables');
      return r.expr(['hz_collections', 'hz_users_auth', 'hz_groups', 'users'])
        .forEach((table) => r.db(db).table(table).wait({timeout: 30})).run(conn);
    }).then(() => {
      this.checkAttempt(attempt);
      // RSI: this should probably be in the 'permissions' plugin
      this.log('debug', 'adding admin user');
      return Promise.all([
        r.db(db).table('users').get('admin')
          .replace((oldRow) =>
            r.branch(oldRow.eq(null),
              {
                id: 'admin',
                groups: ['admin'],
              },
              oldRow),
            {returnChanges: 'always'})('changes')(0)
          .do((res) =>
            r.branch(res('new_val').eq(null),
                     r.error(res('error')),
                     res('new_val'))).run(conn),
        r.db(db).table('hz_groups').get('admin')
          .replace((oldRow) =>
            r.branch(oldRow.eq(null),
              {
                id: 'admin',
                // eslint-disable-next-line camelcase
                rules: {carte_blanche: {template: 'any()'}},
              },
              oldRow),
            {returnChanges: 'always'})('changes')(0)
          .do((res) =>
            r.branch(res('new_val').eq(null),
                     r.error(res('error')),
                     res('new_val'))).run(conn),
      ]);
    }).then(() => {
      this.checkAttempt(attempt);
      this.log('debug', 'metadata sync complete');
      this.emit('onReady');
    }).catch((err) => {
      if (!(err instanceof StaleAttemptError)) {
        this.log('error', `Metadata initialization failed: ${err.stack}`);
        setTimeout(() => { this.doInit(conn, attempt); }, 1000);
      }
    });
  }

  close(reason) {
    this.currentAttempt = null;
    super.close(reason);
    this.connSubs.close(reason);
  }
}

class ReliableMetadata extends Reliable {
  constructor(context, options) {
    super(context);
    this.context = context;
    this.autoCreateCollection = Boolean(options.autoCreateCollection);
    this.autoCreateIndex = Boolean(options.autoCreateIndex);
    this.collections = new Map();

    this.log = (lvl, msg) =>
      this.context.horizon.events.emit('log', lvl, `${options.name} plugin: ${msg}`);

    const r = this.context.horizon.r;
    const db = this.context.horizon.options.projectName;

    this.reliableInit = new ReliableInit(this.context, this.autoCreateCollection, this.log);

    // RSI: stop these from running until after ReliableInit?
    this.collectionChangefeed = new ReliableChangefeed(
      this.context,
      r.db(db)
       .table('hz_collections')
       .filter((row) => row('id').match('^hzp?_').not())
       .changes({squash: false, includeInitial: true, includeTypes: true}),
      {
        onChange: (change) => {
          switch (change.type) {
          case 'initial':
          case 'add':
          case 'change':
            {
              const name = change.new_val.id;
              let collection = this.collections.get(name);
              if (!collection) {
                collection =
                  new Collection(db, name,
                                 this.autoCreateIndex,
                                 this.context.horizon.conn,
                                 this.log,
                                 this.context.horizon.r);
                this.collections.set(name, collection);
              }
              collection._register();
            }
            break;
          case 'uninitial':
          case 'remove':
            {
              const name = change.new_val.id;
              const collection = this.collections.get(name);
              if (collection) {
                collection._unregister();
                if (collection._isSafeToRemove()) {
                  this.collections.delete(name);
                  collection.close();
                }
              }
            }
            break;
          default:
            // log error
            break;
          }
        },
      });

    this.indexChangefeed = new ReliableChangefeed(
      this.context,
      r.db('rethinkdb')
        .table('table_config')
        .filter((row) => r.and(row('db').eq(db),
                               row('name').match('^hzp?_').not()))
        .map((row) => ({
          id: row('id'),
          name: row('name'),
          indexes: row('indexes').filter((idx) => idx.match('^hz_')),
        }))
        .changes({squash: true, includeInitial: true, includeTypes: true}),
      {
        onChange: (change) => {
          switch (change.type) {
          case 'initial':
          case 'add':
          case 'change':
            {
              const name = change.new_val.name;
              const tableId = change.new_val.id;

              let collection = this.collections.get(name);
              if (!collection) {
                collection =
                  new Collection(db, name,
                                 this.autoCreateIndex,
                                 this.context.horizon.conn,
                                 this.log,
                                 this.context.horizon.r);
                this.collections.set(name, collection);
              }
              collection._updateTable(tableId, change.new_val.indexes);
            }
            break;
          case 'uninitial':
          case 'remove':
            {
              const collection = this.collections.get(change.old_val.name);
              if (collection) {
                collection._updateTable(change.old_val.id, null);
                if (collection._isSafeToRemove()) {
                  this.collections.delete(collection);
                  collection.close();
                }
              }
            }
            break;
          default:
            // log error
            break;
          }
        },
      });

    this.readyUnion = new ReliableUnion(this.context, {
      reliableInit: this.reliableInit,
      collectionChangefeed: this.collectionChangefeed,
      indexChangefeed: this.indexChangefeed,
    }, {
      onReady: () => {
        this.emit('onReady');
      },
      onUnready: () => {
        // TODO: fill in the reason for `close`.
        this.emit('onUnready');
        this.collections.forEach((collection) => collection.close());
        this.collections.clear();
      },
    });
  }

  close(reason) {
    return Promise.all([
      super.close(reason),
      this.reliableInit.close(reason),
      this.collectionChangefeed.close(reason),
      this.indexChangefeed.close(reason),
      this.readyUnion.close(reason),
    ]);
  }

  // Public interface for use by plugins or other classes,
  //  returns a Promise of a collection object
  collection(name) {
    return Promise.resolve().then(() => {
      if (name.indexOf('hz_') === 0 || name.indexOf('hzp_') === 0) {
        throw new Error(`Collection "${name}" is reserved for internal use ` +
                        'and cannot be used in requests.');
      } else if (!this.ready) {
        throw new Error('Metadata is not synced with the database.');
      }

      const collection = this.collections.get(name);
      if (!collection && !this.autoCreateCollection) {
        throw new Error(`Collection "${name}" does not exist.`);
      } else if (collection) {
        if (!collection.ready()) {
          return new Promise((resolve, reject) =>
            collection._onReady((maybeErr) => {
              if (maybeErr instanceof Error) {
                reject(maybeErr);
              } else {
                resolve(collection);
              }
            }));
        }
        return collection;
      }
      return this.createCollection(name);
    });
  }

  createCollection(name) {
    let collection;
    return Promise.resolve().then(() => {
      if (name.indexOf('hz_') === 0 || name.indexOf('hzp_') === 0) {
        throw new Error(`Collection "${name}" is reserved for internal use ` +
                        'and cannot be used in requests.');
      } else if (!this.ready) {
        throw new Error('Metadata is not synced with the database.');
      } else if (this.collections.get(name)) {
        throw new Error(`Collection "${name}" already exists.`);
      }

      const db = this.context.horizon.options.projectName;
      collection = new Collection(db, name,
                                  this.autoCreateIndex,
                                  this.context.horizon.conn,
                                  this.log,
                                  this.context.horizon.r);
      this.collections.set(name, collection);

      return queries.createCollection(this.context, name);
    }).then((res) => {
      assert(!res.error, `Collection "${name}" creation failed: ${res.error}`);
      this.log('warn', `collection created: "${name}"`);
      return new Promise((resolve, reject) =>
        collection._onReady((maybeErr) => {
          if (maybeErr instanceof Error) {
            reject(maybeErr);
          } else {
            resolve(collection);
          }
        }));
    }).catch((err) => {
      if (collection && collection._isSafeToRemove()) {
        this.collections.delete(name);
        collection.close();
      }
      throw err;
    });
  }
}

module.exports = ReliableMetadata;
