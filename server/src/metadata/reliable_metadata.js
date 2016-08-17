'use strict';

const error = require('../error');
const {Reliable, ReliableChangefeed, ReliableUnion} = require('../reliable');
const logger = require('../logger');
const Collection = require('./collection').Collection;
const utils = require('../utils');

const r = require('rethinkdb');

const version_field = '$hz_v$';
const metadata_version = [ 2, 0, 0 ];

const create_collection = (db, name, conn) =>
  r.db(db).table('hz_collections').get(name).replace({id: name}).do((res) =>
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
      r.db(db).table('hz_collections').wait({timeout: 30}).run(conn))
    .then(() =>
      Promise.all([
        r.db(db).tableList().contains('users').not().run(conn).then(() =>
          create_collection(db, 'users', conn)),
        r.db(db).table('hz_collections')
          .insert({id: 'hz_metadata', version: metadata_version})
          .run(conn),
      ])
    );

class StaleAttemptError extends Error { }

class ReliableInit extends Reliable {
  constructor(db, reliable_conn, auto_create_collection) {
    super();
    this._db = db;
    this._auto_create_collection = auto_create_collection;
    this._conn_subs = reliable_conn.subscribe({
      onReady: (conn) => {
        this.current_attempt = Symbol();
        this.do_init(conn, this.current_attempt);
      },
      onUnready: () => {
        this.current_attempt = null;
        if (this.ready) {
          this.emit('onUnready');
        }
      },
    });
  }

  check_attempt(attempt) {
    if (attempt !== this.current_attempt) {
      throw new StaleAttemptError();
    }
  }

  do_init(conn, attempt) {
    Promise.resolve().then(() => {
      this.check_attempt(attempt);
      logger.debug('checking rethinkdb version');
      const q = r.db('rethinkdb').table('server_status').nth(0)('process')('version');
      return q.run(conn).then((res) => utils.rethinkdb_version_check(res));
    }).then(() => {
      this.check_attempt(attempt);
      logger.debug('checking for old metadata version');
      const old_metadata_db = `${this._db}_internal`;
      return r.dbList().contains(old_metadata_db).run(conn).then((has_old_db) => {
        if (has_old_db) {
          throw new Error('The Horizon metadata appears to be from v1.x because ' +
                          `the "${old_metadata_db}" database exists.  Please use ` +
                          '`hz migrate` to convert your metadata to the new format.');
        }
      });
    }).then(() => {
      this.check_attempt(attempt);
      logger.debug('checking for internal tables');
      if (this._auto_create_collection) {
        return initialize_metadata(this._db, conn);
      } else {
        return r.dbList().contains(this._db).run(conn).then((has_db) => {
          if (!has_db) {
            throw new Error(`The database ${this._db} does not exist.  ` +
                            'Run `hz schema apply` to initialize the database, ' +
                            'then start the Horizon server.');
          }
        });
      }
    }).then(() => {
      this.check_attempt(attempt);
      logger.debug('waiting for internal tables');
      return r.expr([ 'hz_collections', 'hz_users_auth', 'hz_groups', 'users' ])
        .forEach((table) => r.db(this._db).table(table).wait({timeout: 30})).run(conn);
    }).then(() => {
      this.check_attempt(attempt);
      logger.debug('adding admin user');
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
            {returnChanges: 'always'})('changes')(0)
          .do((res) =>
            r.branch(res('new_val').eq(null),
                     r.error(res('error')),
                     res('new_val'))).run(conn),
        r.db(this._db).table('hz_groups').get('admin')
          .replace((old_row) =>
            r.branch(old_row.eq(null),
              {
                id: 'admin',
                rules: {carte_blanche: {template: 'any()'}},
                [version_field]: 0,
              },
              old_row),
            {returnChanges: 'always'})('changes')(0)
          .do((res) =>
            r.branch(res('new_val').eq(null),
                     r.error(res('error')),
                     res('new_val'))).run(conn),
      ]);
    }).then(() => {
      this.check_attempt(attempt);
      logger.debug('metadata sync complete');
      this.emit('onReady');
    }).catch((err) => {
      if (!(err instanceof StaleAttemptError)) {
        logger.debug(`Metadata initialization failed: ${err}`);
        setTimeout(() => { this.do_init(conn, attempt); }, 1000);
      }
    });
  }

  close(reason) {
    this.current_attempt = null;
    super.close(reason);
    this._conn_subs.close(reason);
  }
}

class ReliableMetadata extends Reliable {
  constructor(project_name,
              reliable_conn,
              auto_create_collection,
              auto_create_index) {
    super();

    this._db = project_name;
    this._reliable_conn = reliable_conn;
    this._auto_create_collection = auto_create_collection;
    this._auto_create_index = auto_create_index;
    this._collections = new Map();

    this._reliable_init = new ReliableInit(
      this._db, reliable_conn, auto_create_collection);

    this._conn_subscription = this._reliable_conn.subscribe({
      onReady: (conn) => {
        this._connection = conn;
      },
      onUnready: () => {
        this._connection = null;
      },
    });

    this._collection_changefeed = new ReliableChangefeed(
      r.db(this._db)
       .table('hz_collections')
       .filter((row) => row('id').match('^hzp?_').not())
       .changes({squash: false, includeInitial: true, includeTypes: true}),
      reliable_conn,
      {
        onChange: (change) => {
          switch (change.type) {
          case 'initial':
          case 'add':
          case 'change':
            {
              const collection_name = change.new_val.id;
              let collection = this._collections.get(collection_name);
              if (!collection) {
                collection = new Collection(this._db, collection_name);
                this._collections.set(collection_name, collection);
              }
              collection._register();
            }
            break;
          case 'uninitial':
          case 'remove':
            {
              const collection_name = change.new_val.id;
              const collection = this._collections.get(collection_name);
              if (collection) {
                collection._unregister();
                if (collection._is_safe_to_remove()) {
                  this._collections.delete(collection_name);
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


    this._index_changefeed = new ReliableChangefeed(
      r.db('rethinkdb')
        .table('table_config')
        .filter((row) => r.and(row('db').eq(this._db),
                               row('name').match('^hzp?_').not()))
        .map((row) => ({
          id: row('id'),
          name: row('name'),
          indexes: row('indexes').filter((idx) => idx.match('^hz_')),
        }))
        .changes({squash: true, includeInitial: true, includeTypes: true}),
      reliable_conn,
      {
        onChange: (change) => {
          if (!this._connection) { return; }
          switch (change.type) {
          case 'initial':
          case 'add':
          case 'change':
            {
              const collection_name = change.new_val.name;
              const table_id = change.new_val.id;

              let collection = this._collections.get(collection_name);
              if (!collection) {
                collection = new Collection(this._db, collection_name);
                this._collections.set(collection_name, collection);
              }
              collection._update_table(table_id, change.new_val.indexes, this._connection);
            }
            break;
          case 'uninitial':
          case 'remove':
            {
              const collection = this._collections.get(change.old_val.name);
              if (collection) {
                collection._update_table(change.old_val.id, null, this._connection);
                if (collection._is_safe_to_remove()) {
                  this._collections.delete(collection);
                  collection._close();
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

    this._ready_union = new ReliableUnion({
      reliable_init: this._reliable_init,
      collection_changefeed: this._collection_changefeed,
      index_changefeed: this._index_changefeed,
    }, {
      onReady: () => {
        this.emit('onReady');
      },
      onUnready: () => {
        // TODO: fill in the reason for `close`.
        this.emit('onUnready');
        this._collections.forEach((collection) => collection.close());
        this._collections.clear();
      },
    });
  }

  close(reason) {
    return Promise.all([
      super.close(reason),
      this._reliable_init.close(reason),
      this._collection_changefeed.close(reason),
      this._index_changefeed.close(reason),
      this._ready_union.close(reason),
    ]);
  }

  // Public interface for use by plugins or other classes
  collection(name) {
    if (name.indexOf('hz_') === 0 || name.indexOf('hzp_') === 0) {
      throw new Error(`Collection "${name}" is reserved for internal use ` +
                      'and cannot be used in requests.');
    } else if (!this.ready) {
      throw new Error('ReliableMetadata is not ready.');
    }

    const collection = this._collections.get(name);
    if (!collection) { throw new error.CollectionMissing(name); }
    if (!collection._get_table().ready()) { throw new error.CollectionNotReady(collection); }
    return collection;
  }

  create_collection(name, done) {
    if (name.indexOf('hz_') === 0 || name.indexOf('hzp_') === 0) {
      throw new Error(`Collection "${name}" is reserved for internal use ` +
                      'and cannot be used in requests.');
    } else if (!this.ready) {
      throw new Error('ReliableMetadata is not ready.');
    } else if (this._collections.get(name)) {
      throw new Error(`Collection "${name}" already exists.`);
    }

    const collection = new Collection(this._db, name);
    this._collections.set(name, collection);

    create_collection(this._db, name, this._reliable_conn.connection()).then((res) => {
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
        return err.collection._create_index(err.fields, this._reliable_conn.connection(), done);
      }
      done(err);
    } catch (new_err) {
      logger.debug(`Error when handling error: ${new_err.message}`);
      done(new_err);
    }
  }

  reliable_connection() {
    return this._reliable_conn;
  }
}

module.exports = {ReliableMetadata, create_collection, initialize_metadata};
