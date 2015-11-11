'use strict';

const utils  = require('./utils.js');

const assert = require('assert');
const r      = require('rethinkdb');

module.exports.suite = (table) => describe('Protocol', () => all_tests(table));

var all_tests = (table) => {
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
          assert.strictEqual(err.message, "'type' must be specified.");
          done();
        });
    });

  it('no options', (done) => {
      utils.stream_test({ request_id: 1, type: 'fake' }, (err, res) => {
          assert.deepStrictEqual(res, []),
          assert.strictEqual(err.message, "'options' must be specified."),
          done();
        });
    });

  it('invalid endpoint', (done) => {
      utils.stream_test({ request_id: 2, type: 'fake', options: { } }, (err, res) => {
          assert.deepStrictEqual(res, []),
          assert.strictEqual(err.message, "'fake' is not a recognized endpoint.");
          done();
        });
    });

  // Make sure the server properly cleans up a client connection when it
  // disconnects. Open a changefeed, disconnect the client, then make sure the
  // changefeed would have gotten an event.
  // We don't check any results, we're just seeing if the server crashes.
  it('client disconnect during changefeed', (done) => {
      utils.fusion_conn().send(JSON.stringify(
        {
          request_id: 3,
          type: 'subscribe',
          options: {
            collection: table,
            field_name: 'id',
          },
        }));
      utils.add_fusion_listener(3, (msg) => {
          if (msg.error !== undefined) {
            throw new Error(msg.error);
          } else if (msg.state === 'synced') {
            utils.close_fusion_conn();
            r.table(table).insert({}).run(utils.rdb_conn())
             .then((res) => done());
          }
        });
    });

  // Make sure the server properly cleans up a client connection when it
  // disconnects.  Close the connection immediately after sending the request.
  // We don't check any results, we're just seeing if the server crashes.
  it('client disconnect during query', (done) => {
      var msg = { request_id: 3, type: 'query', options: { collection: table } };
      utils.fusion_conn().send(JSON.stringify(
        {
          request_id: 4,
          type: 'query',
          options: {
            collection: table,
            field_name: 'id',
          },
        }), () => (utils.close_fusion_conn(), done()));
    });
};
