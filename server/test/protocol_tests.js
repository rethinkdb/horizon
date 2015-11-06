'use strict';

const utils = require('./utils.js');
const assert = require('assert');

module.exports.all_tests = function () {
  beforeEach('Authenticate client', utils.temp_auth);

  it('unparseable', (done) => {
      var conn = utils.fusion_conn();
      conn.removeAllListeners('error');
      conn.send('foobar');
      conn.once('close', (code, msg) => {
          assert.equal(code, 1002);
          assert.equal(msg, 'Unparseable request: foobar');
          done();
        });
    });

  it('no request_id', (done) => {
      var conn = utils.fusion_conn();
      conn.removeAllListeners('error');
      conn.send('{ }');
      conn.once('close', (code, msg) => {
          assert.equal(code, 1002);
          assert.equal(msg, 'Unparseable request: { }');
          done();
        });
    });

  it('no type', (done) => {
      utils.simple_test(
        { request_id: 0 },
        { request_id: 0, error: "'type' must be specified." }, done)
    });

  it('no options', (done) => {
      utils.simple_test(
        { request_id: 1, type: "fake" },
        { request_id: 1, error: "'options' must be specified." }, done)
    });

 it('invalid endpoint', (done) => {
      utils.simple_test(
        { request_id: 2, type: "fake", options: { } },
        { request_id: 2, error: "'fake' is not a recognized endpoint." }, done)
   });
};
