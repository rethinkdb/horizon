'use strict';

const utils = require('./utils');

const assert = require('assert');

const all_tests = (collection) => {
  beforeEach('Authenticate client', utils.horizon_admin_auth);

  it('unparseable', (done) => {
    const conn = utils.horizon_conn();
    conn.removeAllListeners('error');
    conn.send('foobar');
    conn.once('close', (code, reason) => {
      assert.strictEqual(code, 1002);
      assert(/^Invalid JSON/.test(reason));
      done();
    });
  });

  it('no request_id', (done) => {
    const conn = utils.horizon_conn();
    conn.removeAllListeners('error');
    conn.send('{ }');
    conn.once('close', (code, reason) => {
      assert.strictEqual(code, 1002);
      assert(/^Protocol error: Request validation error/.test(reason));
      done();
    });
  });

  it('keepalive', (done) => {
    utils.stream_test({request_id: 0, type: 'keepalive'}, (err, res) => {
      assert.deepStrictEqual(res, []);
      assert.ifError(err);
      done();
    });
  });

  it('end_subscription', (done) => {
    //const conn = utils.horizon_conn();
    //conn.send('{"request_id": 0, "type": "end_subscription"}');

    // There is no response for an end_subscription, so just run a dummy keepalive roundtrip
    utils.stream_test({request_id: 1, type: 'keepalive'}, (err, res) => {
      assert.deepStrictEqual(res, []);
      assert.ifError(err);
      done();
    });
  });

  it('no options', (done) => {
    utils.stream_test({request_id: 1}, (err, res) => {
      assert.deepStrictEqual(res, []);
      utils.check_error(err, '"options" is required');
      done();
    });
  });

  it('invalid method', (done) => {
    utils.stream_test({request_id: 2, options: {fake: []}}, (err, res) => {
      assert.deepStrictEqual(res, []);
      assert.strictEqual(err.message, 'Error: no terminal in request');
      done();
    });
  });

  // Make sure the server properly cleans up a client connection when it
  // disconnects. Open a changefeed, disconnect the client, then make sure the
  // changefeed would have gotten an event.
  // We don't check any results, we're just seeing if the server crashes.
  it('client disconnect during changefeed', (done) => {
    utils.horizon_conn().send(JSON.stringify(
      {
        request_id: 3,
        options: {
          collection: [collection],
          watch: [],
        },
      }));
    utils.add_horizon_listener(3, (msg) => {
      if (msg.error !== undefined) {
        throw new Error(msg.error);
      } else if (msg.state === 'synced') {
        utils.close_horizon_conn();
        utils.table(collection).insert({}).run(utils.rdb_conn())
         .then(() => done());
      }
    });
  });

  // Make sure the server properly cleans up a client connection when it
  // disconnects.  Close the connection immediately after sending the request.
  // We don't check any results, we're just seeing if the server crashes.
  it('client disconnect during query', (done) => {
    utils.horizon_conn().send(JSON.stringify(
      {
        request_id: 4,
        options: {
          collection: [collection],
          field_name: 'id',
          query: [],
        },
      }), () => (utils.close_horizon_conn(), done()));
  });
};

const suite = (collection) => describe('Protocol', () => all_tests(collection));

module.exports = {suite};
