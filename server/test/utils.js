'use strict';

const fusion = require('../src/server');

const assert = require('assert');
const child_process = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');
const r = require('rethinkdb');
const websocket = require('ws');

const db = `fusion`;
const data_dir = `./rethinkdb_data_test`;

const log_file = `./fusion_test_${process.pid}.log`;
const logger = fusion.logger;
logger.level = 'debug';
logger.add(logger.transports.File, { filename: log_file });
logger.remove(logger.transports.Console);

// Variables used by most tests
let rdb_http_port, rdb_port, rdb_conn, fusion_server, fusion_port, fusion_conn, fusion_listeners;
let fusion_authenticated = false;

const each_line_in_pipe = (pipe, callback) => {
  let buffer = '';
  pipe.on('data', (data) => {
    buffer += data.toString();

    let endline_pos = buffer.indexOf('\n');
    while (endline_pos !== -1) {
      const line = buffer.slice(0, endline_pos);
      buffer = buffer.slice(endline_pos + 1);
      callback(line);
      endline_pos = buffer.indexOf('\n');
    }
  });
};

const start_rdb_server = (done) => {
  const rmdirSync_recursive = (dir) => {
    try {
      fs.readdirSync(dir).forEach((item) => {
        const full_path = path.join(dir, item);
        if (fs.statSync(full_path).isDirectory()) {
          rmdirSync_recursive(full_path);
        } else {
          fs.unlinkSync(full_path);
        }
      });
      fs.rmdirSync(dir);
    } catch (err) { /* Do nothing */ }
  };
  rmdirSync_recursive(data_dir);

  const proc = child_process.spawn('rethinkdb', [ '--http-port', '0',
                                                  '--cluster-port', '0',
                                                  '--driver-port', '0',
                                                  '--cache-size', '10',
                                                  '--directory', data_dir ]);
  proc.once('error', (err) => assert.ifError(err));

  process.on('exit', () => {
    proc.kill('SIGKILL');
    rmdirSync_recursive(data_dir);
  });

  // Error if we didn't get the port before the server exited
  proc.stdout.once('end', () => assert(rdb_port !== undefined));

  const maybe_start_rdb_connection = () => {
    if (rdb_port !== undefined && rdb_http_port !== undefined) {
      r.connect({ db, port: rdb_port }).then((c) => {
        rdb_conn = c;
        return r.dbCreate(db).run(c);
      }).then((res) => {
        assert.strictEqual(res.dbs_created, 1);
        done();
      });
    }
  };

  each_line_in_pipe(proc.stdout, (line) => {
      logger.info(`rethinkdb stdout: ${line}`);
      if (rdb_port === undefined) {
        const matches = line.match(/^Listening for client driver connections on port (\d+)$/);
        if (matches !== null && matches.length === 2) {
          rdb_port = parseInt(matches[1]);
          maybe_start_rdb_connection();
        }
      }
      if (rdb_http_port === undefined) {
        const matches = line.match(/^Listening for administrative HTTP connections on port (\d+)$/);
        if (matches !== null && matches.length === 2) {
          rdb_http_port = parseInt(matches[1]);
          maybe_start_rdb_connection();
        }
      }
  });

  each_line_in_pipe(proc.stderr, (line) => logger.info(`rethinkdb stderr: ${line}`));
};

// Creates a table, no-op if it already exists, uses fusion server prereqs
const create_table = (table, done) => {
  assert.notStrictEqual(fusion_server, undefined);
  assert.notStrictEqual(fusion_port, undefined);
  let conn = new websocket(`ws://localhost:${fusion_port}`,
                           fusion.protocol, { rejectUnauthorized: false })
    .once('error', (err) => assert.ifError(err))
    .on('open', () => {
      conn.send(JSON.stringify({ request_id: 0 })); // Authenticate
      conn.once('message', () => {
        // This 'query' should auto-create the table if it's missing
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

const start_fusion_server = (done) => {
  assert.strictEqual(fusion_server, undefined);

  const http_server = new http.Server();
  http_server.listen(0, () => {
    fusion_port = http_server.address().port;
    fusion_server = new fusion.Server(http_server, { rdb_port, db, dev_mode: true });
    fusion_server.ready().then(done);
  });
  http_server.on('error', (err) => done(err));
};

const close_fusion_server = () => {
  if (fusion_server !== undefined) { fusion_server.close(); }
  fusion_server = undefined;
};

const add_fusion_listener = (request_id, cb) => {
  assert(fusion_authenticated, 'fusion_conn was not authenticated before making requests');
  assert.notStrictEqual(request_id, undefined);
  assert.notStrictEqual(fusion_listeners, undefined);
  assert.strictEqual(fusion_listeners.get(request_id), undefined);
  fusion_listeners.set(request_id, cb);
};

const remove_fusion_listener = (request_id) => {
  assert.notStrictEqual(request_id, undefined);
  assert.notStrictEqual(fusion_listeners, undefined);
  fusion_listeners.delete(request_id);
};

const dispatch_message = (raw) => {
  const msg = JSON.parse(raw);
  assert.notStrictEqual(msg.request_id, undefined);
  assert.notStrictEqual(fusion_listeners, undefined);
  const listener = fusion_listeners.get(msg.request_id);
  assert.notStrictEqual(listener, undefined);
  listener(msg);
};

const open_fusion_conn = (done) => {
  assert.notStrictEqual(fusion_server, undefined);
  assert.strictEqual(fusion_conn, undefined);
  fusion_authenticated = false;
  fusion_listeners = new Map();
  fusion_conn =
    new websocket(`ws://localhost:${fusion_port}`,
                  fusion.protocol, { rejectUnauthorized: false })
      .once('error', (err) => assert.ifError(err))
      .on('open', () => done());
};

const close_fusion_conn = () => {
  if (fusion_conn) { fusion_conn.close(); }
  fusion_conn = undefined;
  fusion_listeners = undefined;
  fusion_authenticated = false;
};

const fusion_auth = (req, cb) => {
  assert(fusion_conn && fusion_conn.readyState === websocket.OPEN);
  fusion_conn.send(JSON.stringify(req));
  fusion_conn.once('message', (auth_msg) => {
    fusion_authenticated = true;
    const res = JSON.parse(auth_msg);
    fusion_conn.on('message', (msg) => dispatch_message(msg));
    cb(res);
  });
};

const fusion_default_auth = (done) => {
  fusion_auth({ request_id: -1 }, (res) => {
    assert.deepEqual(res, { request_id: -1, user_id: 0 });
    done();
  });
};

// `stream_test` will send a request (containing a request_id), and call the
// callback with (err, res), where `err` is the error string if an error
// occurred, or `null` otherwise.  `res` will be an array, being the concatenation
// of all `data` items returned by the server for the given request_id.
// TODO: this doesn't allow for dealing with multiple states (like 'synced').
const stream_test = (req, cb) => {
  assert(fusion_conn && fusion_conn.readyState === websocket.OPEN);
  fusion_conn.send(JSON.stringify(req));
  const results = [];
  add_fusion_listener(req.request_id, (msg) => {
    if (msg.data !== undefined) {
      results.push.apply(results, msg.data);
    }
    if (msg.error !== undefined) {
      remove_fusion_listener(req.request_id);
      cb(new Error(msg.error), results);
    } else if (msg.state === 'complete') {
      remove_fusion_listener(req.request_id);
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
  fusion_conn: () => fusion_conn,
  fusion_port: () => fusion_port,
  fusion_listeners: () => fusion_listeners,

  start_rdb_server,
  create_table, populate_table, clear_table,

  start_fusion_server, close_fusion_server,
  open_fusion_conn, close_fusion_conn,
  fusion_auth, fusion_default_auth,
  add_fusion_listener, remove_fusion_listener,

  stream_test,
  check_error,
  each_line_in_pipe,
};
