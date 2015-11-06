'use strict';

const fusion        = require('../src/server.js');

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
var rdb_server, rdb_port, rdb_conn; // Instantiated once
var fusion_server, fusion_port; // Instantiated for HTTP and HTTPS
var fusion_conn; // Instantiated for every test

module.exports.start_rdb_server = (done) => {
  var proc = child_process.spawn('rethinkdb', [ '--http-port', '0',
                                                '--cluster-port', '0',
                                                '--driver-port', '0',
                                                '--cache-size', '10',
                                                '--directory', data_dir ]);
  proc.once('error', (err) => assert.ifError(err));

  process.on('exit', () => {
      proc.kill('SIGKILL');
      var rmdirSync_recursive = (dir) => {
          fs.readdirSync(dir).forEach((item) => {
              var full_path = path.join(dir, item);
              if (fs.statSync(full_path).isDirectory()) {
                rmdirSync_recursive(full_path);
              } else {
                fs.unlinkSync(full_path);
              }
            });
          fs.rmdirSync(dir);
        };
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
      r.connect({ port: rdb_port }).then((c) => (rdb_conn = c, done()));
    });
};

var create_fusion_server = function (backend, opts) {
  opts.local_port = 0;
  opts.rdb_port = rdb_port;
  opts.db = db;
  return new backend(opts);
};

module.exports.start_unsecure_fusion_server = (done) => {
  assert(!fusion_server);
  fusion_server = create_fusion_server(fusion.UnsecureServer, { });
  fusion_server.local_port('localhost').then((p) => fusion_port = p, done());
};

module.exports.start_secure_fusion_server = (done) => {
  assert(!fusion_server);

  // Generate key and cert
  var temp_file = `./tmp.pem`;
  new Promise((resolve, reject) => {
      var proc = child_process.exec(
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
    });
};

module.exports.close_fusion_server = () => {
  if (fusion_server) { fusion_server.close(); }
  fusion_server = undefined;
};

var is_secure = () => {
  assert(fusion_server);
  return fusion_server.constructor.name !== 'UnsecureServer';
};

module.exports.is_secure = is_secure;

module.exports.start_fusion_client = (done) => {
  assert(fusion_server);
  assert(!fusion_conn);
  fusion_conn =
    new websocket(`${is_secure() ? 'wss' : 'ws'}://localhost:${fusion_port}`,
                  fusion.protocol, { rejectUnauthorized: false })
      .once('error', (err) => assert.ifError(err))
      .on('open', () => done());
};

module.exports.close_fusion_client = () => {
  if (fusion_conn) { fusion_conn.close(); }
  fusion_conn = undefined;
};

module.exports.temp_auth = function (done) {
  assert(fusion_conn && fusion_conn.readyState === websocket.OPEN);
  var auth = { };
  fusion_conn.send(JSON.stringify(auth));;
  fusion_conn.once('message', (msg) => {
      var res = JSON.parse(msg);
      assert(res && res.user_id !== undefined);
      done();
    });
};

module.exports.simple_test = function (req, res, done) {
  assert(fusion_conn && fusion_conn.readyState === websocket.OPEN);
  fusion_conn.send(JSON.stringify(req));
  fusion_conn.once('message', (msg) => {
      assert.deepEqual(res, JSON.parse(msg));
      done();
    });
};

module.exports.rdb_conn = () => rdb_conn;
module.exports.fusion_conn = () => fusion_conn;
module.exports.fusion_port = () => fusion_port;
