'use strict';

const horizon = require('../src/server');
const logger = require('../src/logger');

const rm_sync_recursive = require('../../cli/src/utils/rm_sync_recursive');
const start_rdb_server = require('../../cli/src/utils/start_rdb_server');
const each_line_in_pipe = require('../../cli/src/utils/each_line_in_pipe');

const assert = require('assert');
const http = require('http');
const r = require('rethinkdb');
const websocket = require('ws');

const project_name = 'unittest';
const data_dir = './rethinkdb_data_test';

const log_file = `./horizon_test_${process.pid}.log`;
logger.level = 'debug';
logger.add(logger.transports.File, { filename: log_file });
logger.remove(logger.transports.Console);

// Variables used by most tests
let rdb_server, rdb_http_port, rdb_port, rdb_conn, horizon_server, horizon_port, horizon_conn, horizon_listeners;
let horizon_authenticated = false;

const start_rethinkdb = () => {
  logger.info('removing dir');
  rm_sync_recursive(data_dir);

  logger.info('creating server');
  return start_rdb_server({ dataDir: data_dir }).then((server) => {
    rdb_server = server;
    rdb_port = server.driver_port;
    rdb_http_port = server.http_port;
    logger.info('server created, connecting');

    return r.connect({ db: project_name, port: rdb_port });
  }).then((conn) => {
    logger.info('connected');
    rdb_conn = conn;
    return r.dbCreate(project_name).run(conn);
  }).then((res) => {
    assert.strictEqual(res.dbs_created, 1);
  });
};

const stop_rethinkdb = () => rdb_server.close();

// Used to prefix reql queries with the underlying table of a given collection
const table = (collection) =>
  r.table(
    r.db(project_name)
      .table('hz_collections')
      .get(collection)
      .do((row) =>
        r.branch(row.eq(null),
                 r.error('Collection does not exist.'),
                 row('id'))));

const make_admin_token = () => {
  const jwt = horizon_server && horizon_server._auth && horizon_server._auth._jwt;
  assert(jwt);
  return jwt.sign({ id: 'admin', provider: null }).token;
};

// Creates a collection, no-op if it already exists, uses horizon server prereqs
const create_collection = (collection, done) => {
  assert.notStrictEqual(horizon_server, undefined);
  assert.notStrictEqual(horizon_port, undefined);
  const conn = new websocket(`ws://localhost:${horizon_port}/horizon`,
                             horizon.protocol,
                             { rejectUnauthorized: false })
    .once('error', (err) => assert.ifError(err))
    .on('open', () => {
      conn.send(JSON.stringify({ request_id: 123, method: 'token', token: make_admin_token() }));
      conn.once('message', (data) => {
        const res = JSON.parse(data);
        assert.strictEqual(res.request_id, 123);
        assert.strictEqual(typeof res.token, 'string');
        assert.strictEqual(res.id, 'admin');
        assert.strictEqual(res.provider, null);

        // This query should auto-create the collection if it's missing
        conn.send(JSON.stringify({
          request_id: 0,
          type: 'query',
          options: { collection, limit: 0 },
        }));

        conn.once('message', () => {
          conn.close();
          done();
        });
      });
    });
};

// Removes all data from a collection - does not remove indexes
const clear_collection = (collection, done) => {
  assert.notStrictEqual(rdb_conn, undefined);
  table(collection).delete().run(rdb_conn).then(() => done());
};

// Populates a collection with the given rows
// If `rows` is a number, fill in data using all keys in [0, rows)
const populate_collection = (collection, rows, done) => {
  assert.notStrictEqual(rdb_conn, undefined);

  if (rows.constructor.name !== 'Array') {
    table(collection).insert(
      r.range(rows).map(
        (i) => ({ id: i, value: i.mod(4) })
      )).run(rdb_conn).then(() => done());
  } else {
    table(collection).insert(rows).run(rdb_conn).then(() => done());
  }
};

const start_horizon_server = (done) => {
  logger.info('creating http server');
  assert.strictEqual(horizon_server, undefined);

  const http_server = new http.Server();
  http_server.listen(0, () => {
    logger.info('creating horizon server');
    horizon_port = http_server.address().port;
    horizon_server = new horizon.Server(http_server,
      { project_name,
        rdb_port,
        auto_create_collection: true,
        auto_create_index: true,
        permissions: true,
        auth: {
          token_secret: 'hunter2',
          allow_unauthenticated: true,
        },
      });
    horizon_server.ready().catch((err) => logger.info(`horizon server error: ${err}`));
    horizon_server.ready().then(() => logger.info('horizon server ready'));
    horizon_server.ready().then(() => done());
  });
  http_server.on('error', (err) => done(err));
};

const close_horizon_server = () => {
  if (horizon_server !== undefined) { horizon_server.close(); }
  horizon_server = undefined;
};

const add_horizon_listener = (request_id, cb) => {
  assert(horizon_authenticated, 'horizon_conn was not authenticated before making requests');
  assert.notStrictEqual(request_id, undefined);
  assert.notStrictEqual(horizon_listeners, undefined);
  assert.strictEqual(horizon_listeners.get(request_id), undefined);
  horizon_listeners.set(request_id, cb);
};

const remove_horizon_listener = (request_id) => {
  assert.notStrictEqual(request_id, undefined);
  assert.notStrictEqual(horizon_listeners, undefined);
  horizon_listeners.delete(request_id);
};

const dispatch_message = (raw) => {
  const msg = JSON.parse(raw);
  assert.notStrictEqual(msg.request_id, undefined);
  assert.notStrictEqual(horizon_listeners, undefined);

  if (msg.request_id !== null) {
    const listener = horizon_listeners.get(msg.request_id);
    assert.notStrictEqual(listener, undefined);
    listener(msg);
  }
};

const open_horizon_conn = (done) => {
  logger.info('opening horizon conn');
  assert.notStrictEqual(horizon_server, undefined);
  assert.strictEqual(horizon_conn, undefined);
  horizon_authenticated = false;
  horizon_listeners = new Map();
  horizon_conn =
    new websocket(`ws://localhost:${horizon_port}/horizon`,
                  horizon.protocol,
                  { rejectUnauthorized: false })
      .once('error', (err) => assert.ifError(err))
      .on('open', () => done());
};

const close_horizon_conn = () => {
  logger.info('closing horizon conn');
  if (horizon_conn) { horizon_conn.close(); }
  horizon_conn = undefined;
  horizon_listeners = undefined;
  horizon_authenticated = false;
};

const horizon_auth = (req, cb) => {
  assert(horizon_conn && horizon_conn.readyState === websocket.OPEN);
  horizon_conn.send(JSON.stringify(req));
  horizon_conn.once('message', (auth_msg) => {
    horizon_authenticated = true;
    const res = JSON.parse(auth_msg);
    horizon_conn.on('message', (msg) => dispatch_message(msg));
    cb(res);
  });
};

// Create a token for the admin user and use that to authenticate
const horizon_admin_auth = (done) => {
  horizon_auth({ request_id: -1, method: 'token', token: make_admin_token() }, (res) => {
    assert.strictEqual(res.request_id, -1);
    assert.strictEqual(typeof res.token, 'string');
    assert.strictEqual(res.id, 'admin');
    assert.strictEqual(res.provider, null);
    done();
  });
};

const horizon_default_auth = (done) => {
  horizon_auth({ request_id: -1, method: 'unauthenticated' }, (res) => {
    assert.strictEqual(res.request_id, -1);
    assert.strictEqual(typeof res.token, 'string');
    assert.strictEqual(res.id, null);
    assert.strictEqual(res.provider, 'unauthenticated');
    done();
  });
};

// `stream_test` will send a request (containing a request_id), and call the
// callback with (err, res), where `err` is the error string if an error
// occurred, or `null` otherwise.  `res` will be an array, being the concatenation
// of all `data` items returned by the server for the given request_id.
// TODO: this doesn't allow for dealing with multiple states (like 'synced').
const stream_test = (req, cb) => {
  assert(horizon_conn && horizon_conn.readyState === websocket.OPEN);
  const results = [];

  add_horizon_listener(req.request_id, (msg) => {
    if (msg.data !== undefined) {
      results.push.apply(results, msg.data);
    }
    if (msg.error !== undefined) {
      remove_horizon_listener(req.request_id);
      cb(new Error(msg.error), results);
    } else if (msg.state === 'complete') {
      remove_horizon_listener(req.request_id);
      cb(null, results);
    }
  });

  horizon_conn.send(JSON.stringify(req));
};

const check_error = (err, msg) => {
  assert.notStrictEqual(err, null, 'Should have gotten an error.');
  assert(err.message.indexOf(msg) !== -1, err.message);
};

const set_group = (group, done) => {
  assert(horizon_server && rdb_conn);
  r.db(project_name)
    .table('hz_groups')
    .get(group.id)
    .replace(group)
    .run(rdb_conn)
    .then((res, err) => {
      assert.ifError(err);
      assert(res && res.errors === 0);
      done();
    });
};

module.exports = {
  rdb_conn: () => rdb_conn,
  rdb_http_port: () => rdb_http_port,
  rdb_port: () => rdb_port,
  horizon_conn: () => horizon_conn,
  horizon_port: () => horizon_port,
  horizon_listeners: () => horizon_listeners,

  start_rethinkdb, stop_rethinkdb,
  create_collection,
  populate_collection,
  clear_collection,

  start_horizon_server, close_horizon_server,
  open_horizon_conn, close_horizon_conn,
  horizon_auth, horizon_admin_auth, horizon_default_auth,
  add_horizon_listener, remove_horizon_listener,

  set_group,

  stream_test,
  check_error,
  each_line_in_pipe,
  table,
};
