'use strict';

const fusion        = require('../src/server.js');

const r             = require('rethinkdb');
const assert        = require('assert');
const child_process = require('child_process');
const fs            = require('fs');
const http          = require('http');
const https         = require('https');

const byline        = require('byline');
const websocket     = require('ws');

var data_dir = `./rethinkdb_data_test`;
try { fs.rmdirSync(data_dir); } catch (err) { /* Do nothing */ }

var db = `fusion`;
var log_file = `./fusion_test_${process.pid}.log`;
var logger = fusion.logger;
logger.level = 'debug';
logger.add(logger.transports.File, { filename: log_file });
logger.remove(logger.transports.Console);

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

var generate_key_cert = function () {
  var temp_file = `./tmp.pem`;
  return new Promise((resolve, reject) => {
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
          resolve({ key: key, cert: cert });
        });
    });
};

describe('Fusion Server', function () {
  var rdb_server, rdb_port, rdb_conn; // Instantiated once
  var fusion_server, fusion_port; // Instantiated for HTTP and HTTPS
  var fusion_socket; // Instantiated for every test

  var temp_auth = function (done) {
    assert(fusion_socket && fusion_socket.readyState === websocket.OPEN);
    var auth = { };
    fusion_socket.send(JSON.stringify(auth));;
    fusion_socket.once('message', (msg) => {
        var res = JSON.parse(msg);
        assert(res && res.user_id !== undefined);
        done();
      });
  };

  var simple_test = function (req, res, done) {
    assert(fusion_socket && fusion_socket.readyState === websocket.OPEN);
    fusion_socket.send(JSON.stringify(req));
    fusion_socket.once('message', (msg) => {
        assert.deepEqual(res, JSON.parse(msg));
        done();
      });
  };

  before('Spawn RethinkDB', () => rdb_server = new RethinkdbServer());
  before('Get driver port', (done) => rdb_server.driver_port.then((p) => (rdb_port = p, done())));
  before('Connect to RethinkDB', (done) => r.connect({ port: rdb_port }).then((c) => (rdb_conn = c, done())));
  beforeEach(function () { logger.info(`Start test '${this.currentTest.title}'`); });

  describe('HTTP:', () => {
      before('Start Fusion Server', () => fusion_server = new fusion.UnsecureServer(
        { local_port: 0, rdb_port: rdb_port, db: db }));
      after('Close Fusion Server', () => fusion_server && fusion_server.close());

      before('Determine Fusion Server port', (done) => {
          fusion_server.local_port('localhost').then((p) => (fusion_port = p, done()));
        });

      beforeEach('Connect to Fusion Server', (done) => fusion_socket =
          new websocket(`ws://localhost:${fusion_port}`, fusion.protocol)
            .once('error', (err) => assert.ifError(err))
            .on('open', () => done()));
      beforeEach('Authorize client connection', (done) => temp_auth(done));
      afterEach('Close client connection', () => fusion_socket && fusion_socket.close());

      it('Response body should == actual code from file', (done) => {
          http.get(`http://localhost:${fusion_port}/fusion.js`, (res) => {
              const code = fs.readFileSync('../client/dist/build.js');
              var buffer = '';
              assert.equal(res.statusCode, 200);
              res.on('data', (delta) => buffer += delta);
              res.on('end', () => (assert.equal(buffer, code), done()));
            });
        });

        describe('Protocol Errors:', () => {
            it('unparseable', (done) => {
                fusion_socket.removeAllListeners('error');
                fusion_socket.send('foobar');
                fusion_socket.once('close', (code, msg) => {
                    assert.equal(code, 1002);
                    assert.equal(msg, 'Unparseable request: foobar');
                    done();
                  });
              });
            it('no request_id', (done) => {
                fusion_socket.removeAllListeners('error');
                fusion_socket.send('{ }');
                fusion_socket.once('close', (code, msg) => {
                    assert.equal(code, 1002);
                    assert.equal(msg, 'Unparseable request: { }');
                    done();
                  });
              });
            it('no type', (done) => {
                simple_test({request_id: 0},
                            {request_id: 0, error: "'type' must be specified."}, done)
              });
            it('no options', (done) => {
                simple_test({request_id: 1, type: "fake"},
                            {request_id: 1, error: "'options' must be specified."}, done)
              });
             it('invalid endpoint', (done) => {
                simple_test({request_id: 2, type: "fake", options: { }},
                            {request_id: 2, error: "'fake' is not a recognized endpoint."}, done)
               });
          });
    });

  describe('HTTPS:', () => {
      var key, cert;
      before('Generate certificate', (done) =>
        generate_key_cert().then((res) => (key = res.key, cert = res.cert, done())));
      before('Start Fusion Server', () => fusion_server = new fusion.Server(
        { local_port: 0, rdb_port: rdb_port, db: db, key: key, cert: cert }));
      after('Close Fusion Server', () => fusion_server && fusion_server.close());

      before('Determine Fusion Server port', (done) => {
          fusion_server.local_port('localhost').then((p) => (fusion_port = p, done()));
        });

      beforeEach('Connect to Fusion Server', (done) => fusion_socket =
          new websocket(`wss://localhost:${fusion_port}`, fusion.protocol,
                        { rejectUnauthorized: false })
            .once('error', (err) => assert.ifError(err))
            .on('open', done));
      beforeEach('Authorize client connection', (done) => temp_auth(done));
      afterEach('Close client connection', () => fusion_socket && fusion_socket.close());

      it('Response body should == actual code from file', (done) => {
          https.get({ hostname: 'localhost',
                      port: fusion_port,
                      path: '/fusion.js',
                      rejectUnauthorized: false } , (res) => {
              const code = fs.readFileSync('../client/dist/build.js');
              var buffer = '';
              assert.equal(res.statusCode, 200);
              res.on('data', (delta) => buffer += delta);
              res.on('end', () => (assert.equal(buffer, code), done()));
            });
        });
    });
});
