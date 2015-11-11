'use strict';

const fusion = require('../src/server');

const assert        = require('assert');
const child_process = require('child_process');
const fs            = require('fs');
const path          = require('path');
const r             = require('rethinkdb');
const websocket     = require('ws');

const db = `fusion`;
const data_dir = `./rethinkdb_data_test`;

const log_file = `./fusion_test_${process.pid}.log`;
const logger = fusion.logger;
logger.level = 'debug';
logger.add(logger.transports.File, { filename: log_file });
logger.remove(logger.transports.Console);

// Variables used by most tests
var rdb_port, rdb_conn; // Instantiated once
var fusion_server, fusion_port; // Instantiated for HTTP and HTTPS
var fusion_conn; // Instantiated for every test

module.exports.start_rdb_server = (done) => {
  var rmdirSync_recursive = (dir) => {
      try {
        fs.readdirSync(dir).forEach((item) => {
            var full_path = path.join(dir, item);
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

  var proc = child_process.spawn('rethinkdb', [ '--http-port', '0',
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

  var buffer = '';
  proc.stdout.on('data', (data) => {
      buffer += data.toString();

      var endline_pos = buffer.indexOf('\n');
      if (endline_pos === -1) { return; }

      var line = buffer.slice(0, endline_pos);
      buffer = buffer.slice(endline_pos + 1);

      var matches = line.match(/^Listening for client driver connections on port (\d+)$/);
      if (matches === null || matches.length !== 2) { return; }

      proc.stdout.removeAllListeners('data');
      rdb_port = parseInt(matches[1]);
      r.connect({ port: rdb_port, db: db }).then((c) => {
          rdb_conn = c;
          return r.dbCreate(db).run(c);
        }).then((res) => {
          assert.strictEqual(res.dbs_created, 1);
          done();
        });
    });
};

// Creates a table, no-op if it already exists
module.exports.create_table = (table, done) => {
  assert.notStrictEqual(rdb_conn, undefined);
  r.tableCreate(table).run(rdb_conn)
   .then(() => done(),
         (err) => {
           assert(/Table `\w+\.\w+` already exists\./.test(err.msg));
           done();
         });
};

// Removes all data from a table - does not remove indexes
module.exports.clear_table = (table, done) => {
  assert.notStrictEqual(rdb_conn, undefined);
  r.table(table).delete().run(rdb_conn).then(() => done());
};

// Populates a table with random rows with keys in the range [0, num_rows)
module.exports.populate_table = (table, num_rows, done) => {
  assert.notStrictEqual(rdb_conn, undefined);
  r.table(table).insert(
      r.range(num_rows).map((i) => ({ id: i }))
    ).run(rdb_conn).then(() => done());
};

var create_fusion_server = (backend, opts) => {
  opts.local_port = 0;
  opts.rdb_port = rdb_port;
  opts.db = db;
  return new backend(opts);
};

module.exports.start_unsecure_fusion_server = (done) => {
  assert.strictEqual(fusion_server, undefined);
  fusion_server = create_fusion_server(fusion.UnsecureServer, { });
  fusion_server.local_port('localhost').then((p) => fusion_port = p, done());
};

module.exports.start_secure_fusion_server = (done) => {
  assert.strictEqual(fusion_server, undefined);

  // Generate key and cert
  var temp_file = `./tmp.pem`;
  child_process.exec(
    `openssl req -x509 -nodes -batch -newkey rsa:2048 -keyout ${temp_file} -days 1`,
    (err, stdout) => {
      assert.ifError(err);
      var cert_start = stdout.indexOf('-----BEGIN CERTIFICATE-----');
      var cert_end = stdout.indexOf('-----END CERTIFICATE-----');
      assert(cert_start !== -1 && cert_end !== -1);

      var cert = stdout.slice(cert_start, cert_end);
      cert += '-----END CERTIFICATE-----\n';

      var key = fs.readFileSync(temp_file);
      fs.unlinkSync(temp_file);

      fusion_server = create_fusion_server(fusion.Server, { key: key, cert: cert });
      fusion_server.local_port('localhost').then((p) => fusion_port = p, done());
    });
};

module.exports.close_fusion_server = () => {
  if (fusion_server !== undefined) { fusion_server.close(); }
  fusion_server = undefined;
};

var is_secure = () => {
  assert.notStrictEqual(fusion_server, undefined);
  return fusion_server.constructor.name !== 'UnsecureServer';
};

module.exports.is_secure = is_secure;

var fusion_listeners;

var add_fusion_listener = (request_id, cb) => {
  assert(fusion_authenticated, 'fusion_conn was not authenticated before making requests');
  assert.notStrictEqual(request_id, undefined);
  assert.notStrictEqual(fusion_listeners, undefined);
  assert.strictEqual(fusion_listeners.get(request_id), undefined);
  fusion_listeners.set(request_id, cb);
};

var remove_fusion_listener = (request_id) => {
  assert.notStrictEqual(request_id, undefined);
  assert.notStrictEqual(fusion_listeners, undefined);
  fusion_listeners.delete(request_id);
};

module.exports.fusion_listeners = () => fusion_listeners;
module.exports.add_fusion_listener = add_fusion_listener;
module.exports.remove_fusion_listener = remove_fusion_listener;

var dispatch_message = (raw) => {
  var msg = JSON.parse(raw);
  assert.notStrictEqual(msg.request_id, undefined);
  var listener = fusion_listeners.get(msg.request_id);
  assert.notStrictEqual(listener, undefined);
  listener(msg);
};

module.exports.open_fusion_conn = (done) => {
  assert.notStrictEqual(fusion_server, undefined);
  assert.strictEqual(fusion_conn, undefined);
  fusion_authenticated = false;
  fusion_listeners = new Map();
  fusion_conn =
    new websocket(`${is_secure() ? 'wss' : 'ws'}://localhost:${fusion_port}`,
                  fusion.protocol, { rejectUnauthorized: false })
      .once('error', (err) => assert.ifError(err))
      .on('open', () => done());
};

module.exports.close_fusion_conn = () => {
  if (fusion_conn) { fusion_conn.close(); }
  fusion_conn = undefined;
  fusion_listeners = undefined;
  fusion_authenticated = false;
};

var fusion_authenticated = false;
var fusion_auth = (req, cb) => {
  assert(fusion_conn && fusion_conn.readyState === websocket.OPEN);
  fusion_conn.send(JSON.stringify(req));
  fusion_conn.once('message', (msg) => {
      fusion_authenticated = true;
      var res = JSON.parse(msg);
      fusion_conn.on('message', (msg) => dispatch_message(msg));
      cb(res);
    });
};

module.exports.fusion_auth = fusion_auth;
module.exports.fusion_default_auth = (done) => {
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
module.exports.stream_test = (req, cb) => {
  assert(fusion_conn && fusion_conn.readyState === websocket.OPEN);
  fusion_conn.send(JSON.stringify(req));
  var results = [];
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

module.exports.check_error = (err, msg) => {
  assert.notStrictEqual(err, null);
  assert(err.message.indexOf(msg) !== -1, err.message);
};

module.exports.rdb_conn = () => rdb_conn;
module.exports.fusion_conn = () => fusion_conn;
module.exports.fusion_port = () => fusion_port;
