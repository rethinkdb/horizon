'use strict';

const utils = require('./utils.js');
const assert = require('assert');

module.exports.name = 'Protocol';

module.exports.prepare_database = (done) => done();

module.exports.all_tests = () => {
  beforeEach('Authenticate client', utils.fusion_default_auth);

  it('unparseable', (done) => {
      var conn = utils.fusion_conn();
      conn.removeAllListeners('error');
      conn.send('foobar');
      conn.once('close', (code, msg) => {
          assert.strictEqual(code, 1002);
          assert.strictEqual(msg, 'Unparseable request: foobar');
          done();
        });
    });

  it('no request_id', (done) => {
      var conn = utils.fusion_conn();
      conn.removeAllListeners('error');
      conn.send('{ }');
      conn.once('close', (code, msg) => {
          assert.strictEqual(code, 1002);
          assert.strictEqual(msg, 'Unparseable request: { }');
          done();
        });
    });

  it('no type', (done) => {
      utils.stream_test({ request_id: 0 }, (err, res) => {
          assert.deepStrictEqual(res, []);
          assert.strictEqual(err, "'type' must be specified.");
          done();
        });
    });

  it('no options', (done) => {
      utils.stream_test({ request_id: 1, type: "fake" }, (err, res) => {
          assert.deepStrictEqual(res, []),
          assert.strictEqual(err, "'options' must be specified."),
          done();
        });
    });

 it('invalid endpoint', (done) => {
      utils.stream_test({ request_id: 2, type: "fake", options: { } }, (err, res) => {
          assert.deepStrictEqual(res, []),
          assert.strictEqual(err, "'fake' is not a recognized endpoint.");
          done();
        });
   });
};
