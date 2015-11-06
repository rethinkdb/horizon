'use strict';

const child_process = require('child_process');
const fs            = require('fs');
const byline        = require('byline');
const websocket     = require('ws');
const assert        = require('assert');
const r             = require('rethinkdb');
const fusion        = require('../src/server.js');

var db = `fusion`;
var data_dir = `./rethinkdb_data_test`;

var log_file = `./fusion_test_${process.pid}.log`;
var logger = fusion.logger;
logger.level = 'debug';
logger.add(logger.transports.File, { filename: log_file });
logger.remove(logger.transports.Console);

// Variables used by different tests
var rdb_server, rdb_port, rdb_conn; // Instantiated once
var fusion_server, fusion_port; // Instantiated for HTTP and HTTPS
var fusion_conn; // Instantiated for every test

// TODO: get rid of this class, we don't really need it
class RethinkdbServer {
  constructor() {
    this.proc = child_process.spawn('rethinkdb', [ '--http-port', '0',
                                                   '--cluster-port', '0',
                                                   '--driver-port', '0',
                                                   '--cache-size', '10',
                                                   '--directory', data_dir ]);
    this.proc.once('error', (err) => assert.ifError(err));
    this.proc.once('exit', (res) => logger.error(`rdb server exited: ${res}`));

    this.line_stream = byline(this.proc.stdout);
    this.driver_port = new Promise((resolve, reject) => {
        this.line_stream.on('data', (line) => {
            var matches = line.toString().match(/^Listening for client driver connections on port (\d+)$/);
            if (matches !== null && matches.length === 2) {
              resolve(parseInt(matches[1]));
              this.line_stream.removeAllListeners('data');
            }
          });
      });

    process.on('exit', () => {
        this.proc.kill('SIGKILL');
        try { fs.rmdirSync(data_dir); } catch (err) { /* Do nothing */ }
      });
  }
};

module.exports.start_rdb_server = (done) => {
  rdb_server = new RethinkdbServer();
  rdb_server.driver_port.then((p) => {
      rdb_port = p;
      r.connect({ port: rdb_port }).then((c) => {
          rdb_conn = c;
          done();
        });
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
