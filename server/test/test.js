'use strict';

const fusion        = require('../src/server.js');

const assert        = require('assert');
const child_process = require('child_process');
const fs            = require('fs');
const http          = require('http');
const https         = require('https');

const byline        = require('byline');
const websocket     = require('ws');

var test_dir = `./rethinkdb_data_test`;
try { fs.rmdirSync(test_dir); } catch (err) { /* Do nothing */ }

class RethinkdbServer {
  constructor() {
    this.process = child_process.spawn('rethinkdb', [ '--http-port', '0',
                                                      '--cluster-port', '0',
                                                      '--driver-port', '0',
                                                      '--cache-size', '10',
                                                      '--directory', test_dir ]);
    this.process.on('error', (err) => console.log(`rdb server error: ${err}`));
    this.process.on('exit', (res) => console.log(`rdb server exited: ${res}`));

    this.line_stream = byline(this.process.stdout);
    this.driver_port = new Promise((resolve, reject) => {
        this.line_stream.on('data', (line) => {
            var matches = line.toString().match(/^Listening for client driver connections on port (\d+)$/);
            if (matches !== null && matches.length === 2) {
              resolve(parseInt(matches[1]));
            }
          });
      });
  }

  close() {
    this.process.kill('SIGINT');
  }
};

describe('Fusion Server', function () {
  var rdb_server, rdb_port; // Instantiated once
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

  before(() => rdb_server = new RethinkdbServer());
  after(() => rdb_server && rdb_server.close());

  before((done) => rdb_server.driver_port.then((p) => (rdb_port = p, done())));

  describe('HTTP:', () => {
      before(() => fusion_server = new fusion.UnsecureServer(
        { local_port: 0, rdb_port: rdb_port }));
      after(() => fusion_server && fusion_server.close());

      before((done) => {
          fusion_server.local_port('localhost').then((p) => (fusion_port = p, done()));
        });

      beforeEach((done) => fusion_socket =
          new websocket(`ws://localhost:${fusion_port}`, fusion.protocol)
            .once('error', (err) => assert.ifError(err))
            .on('open', () => done()));
      beforeEach((done) => temp_auth(done));
      afterEach(() => fusion_socket && fusion_socket.close());

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
                fusion_socket.send('invalid json');
                fusion_socket.once('close', (code, msg) => {
                    assert.equal(code, 1002);
                    assert.equal(msg, 'Unparseable request: invalid json');
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
      before(() => fusion_server = new fusion.UnsecureServer(
        { local_port: 0, rdb_port: rdb_port }));
      after(() => fusion_server && fusion_server.close());

      before((done) => {
          fusion_server.local_port('localhost').then((p) => (fusion_port = p, done()));
        });

      beforeEach((done) => fusion_socket =
          new websocket(`ws://localhost:${fusion_port}`, fusion.protocol,
                        { rejectUnauthorized: false })
            .on('open', done));
      beforeEach((done) => temp_auth(done));
      afterEach(() => fusion_socket && fusion_socket.close());
    });
});
