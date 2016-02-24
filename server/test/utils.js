'use strict';

const horizon = require('../src/server');

const rm_sync_recursive = require('../../cli/src/utils/rm_sync_recursive');
const start_rdb_server = require('../../cli/src/utils/start_rdb_server');
const each_line_in_pipe = require('../../cli/src/utils/each_line_in_pipe');

const assert = require('assert');
const child_process = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');
const r = require('rethinkdb');
const websocket = require('ws');

const db = `horizon`;
const data_dir = `./rethinkdb_data_test`;

const log_file = `./horizon_test_${process.pid}.log`;
const logger = horizon.logger;
logger.level = 'debug';
logger.add(logger.transports.File, { filename: log_file });
logger.remove(logger.transports.Console);

// Variables used by most tests
let rdb_http_port, rdb_port, rdb_conn, horizon_server, horizon_port, horizon_conn, horizon_listeners;
let horizon_authenticated = false;

const test_db_server = (done) => {
  rm_sync_recursive(data_dir);

  start_rdb_server({ dataDir: data_dir }).then((info) => {
    rdb_port = info.driverPort;
    rdb_http_port = info.httpPort;

    const conn_promise = r.connect({ db, port: rdb_port });
    conn_promise.then((c) => { rdb_conn = c });
    conn_promise.then((c) => r.dbCreate(db).run(c)).then((res) => {
      assert.strictEqual(res.dbs_created, 1);
      done();
    });
  });
};

// Creates a table, no-op if it already exists, uses horizon server prereqs
const create_table = (table, done) => {
  assert.notStrictEqual(horizon_server, undefined);
  assert.notStrictEqual(horizon_port, undefined);
  let conn = new websocket(`ws://localhost:${horizon_port}/horizon`,
                           horizon.protocol, { rejectUnauthorized: false })
    .once('error', (err) => assert.ifError(err))
    .on('open', () => {
      conn.send(JSON.stringify({ request_id: 123, method: 'unauthenticated' }));
      conn.once('message', (data) => {
        const response = JSON.parse(data);
        assert.deepStrictEqual(response, { request_id: 123, token: response.token });

        // This query should auto-create the table if it's missing
        conn.send(JSON.stringify({
          request_id: 0,
          type: 'query',
          options: { collection: table, limit: 0 },
        }));

        conn.once('message', () => {
          conn.close();
          done();
        });
      });
    });
};

// Removes all data from a table - does not remove indexes
const clear_table = (table, done) => {
  assert.notStrictEqual(rdb_conn, undefined);
  r.table(table).delete().run(rdb_conn).then(() => done());
};

// Populates a table with the given rows
// If `rows` is a number, fill in data using all keys in [0, rows)
const populate_table = (table, rows, done) => {
  assert.notStrictEqual(rdb_conn, undefined);

  if (rows.constructor.name !== 'Array') {
    r.table(table).insert(
      r.range(rows).map(
        (i) => ({ id: i, value: i.mod(4) })
      )).run(rdb_conn).then(() => done());
  } else {
    r.table(table).insert(rows).run(rdb_conn).then(() => done());
  }
};

const start_horizon_server = (done) => {
  assert.strictEqual(horizon_server, undefined);

  const http_server = new http.Server();
  http_server.listen(0, () => {
    horizon_port = http_server.address().port;
    horizon_server = new horizon.Server(http_server,
      { rdb_port,
        db,
        auto_create_table: true,
        auto_create_index: true,
        auth: {
          allow_unauthenticated: true,
        },
      });
    horizon_server.ready().then(done);
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
  const listener = horizon_listeners.get(msg.request_id);
  assert.notStrictEqual(listener, undefined);
  listener(msg);
};

const open_horizon_conn = (done) => {
  assert.notStrictEqual(horizon_server, undefined);
  assert.strictEqual(horizon_conn, undefined);
  horizon_authenticated = false;
  horizon_listeners = new Map();
  horizon_conn =
    new websocket(`ws://localhost:${horizon_port}/horizon`,
                  horizon.protocol, { rejectUnauthorized: false })
      .once('error', (err) => assert.ifError(err))
      .on('open', () => done());
};

const close_horizon_conn = () => {
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

const horizon_default_auth = (done) => {
  horizon_auth({ request_id: -1, method: 'unauthenticated' }, (res) => {
    assert.deepStrictEqual(res, { request_id: -1, token: res.token });
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
  horizon_conn.send(JSON.stringify(req));
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
};

const check_error = (err, msg) => {
  assert.notStrictEqual(err, null, `Should have gotten an error.`);
  assert(err.message.indexOf(msg) !== -1, err.message);
};

module.exports = {
  rdb_conn: () => rdb_conn,
  rdb_http_port: () => rdb_http_port,
  rdb_port: () => rdb_port,
  horizon_conn: () => horizon_conn,
  horizon_port: () => horizon_port,
  horizon_listeners: () => horizon_listeners,

  test_db_server,
  create_table, populate_table, clear_table,

  start_horizon_server, close_horizon_server,
  open_horizon_conn, close_horizon_conn,
  horizon_auth, horizon_default_auth,
  add_horizon_listener, remove_horizon_listener,

  stream_test,
  check_error,
  each_line_in_pipe,
};
