'use strict';

const utils = require('./utils');

const assert = require('assert');
const r = require('rethinkdb');

const all_tests = (table) => {
  beforeEach('Authenticate client', utils.horizon_default_auth);

  it('unparseable', (done) => {
    const conn = utils.horizon_conn();
    // We'll use the websocket api as opposed to `ws` event emitter api
    // to keep the client implementation simple. Server sockets have the
    // event emitter api still.
    conn.onerror = null;
    conn.send('foobar');
    conn.onclose = (event) => {
      assert.strictEqual(event.code, 1002);
      assert.strictEqual(event.reason, 'Invalid JSON.');
      done();
    };
  });

  it('no request_id', (done) => {
    const conn = utils.horizon_conn();
    conn.onerror = null;
    conn.send('{ }');
    conn.onclose = (event) => {
      assert.strictEqual(event.code, 1002);
      assert.strictEqual(event.reason, 'Invalid request.');
      done();
    };
  });

  it('no type', (done) => {
    utils.stream_test({ request_id: 0 }, (err, res) => {
      assert.deepStrictEqual(res, [ ]);
      utils.check_error(err, '"type" is required');
      done();
    });
  });

  it('no options', (done) => {
    utils.stream_test({ request_id: 1, type: 'fake' }, (err, res) => {
      assert.deepStrictEqual(res, [ ]);
      utils.check_error(err, '"options" is required');
      done();
    });
  });

  it('invalid endpoint', (done) => {
    utils.stream_test({ request_id: 2, type: 'fake', options: { } }, (err, res) => {
      assert.deepStrictEqual(res, [ ]);
      assert.strictEqual(err.message, '"fake" is not a registered request type.');
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
        type: 'subscribe',
        options: {
          collection: table,
        },
      }));
    utils.add_horizon_listener(3, (msg) => {
      if (msg.error !== undefined) {
        throw new Error(msg.error);
      } else if (msg.state === 'synced') {
        utils.close_horizon_conn();
        r.table(table).insert({}).run(utils.rdb_conn())
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
        type: 'query',
        options: {
          collection: table,
          field_name: 'id',
        },
      }));
    // We could use the send callback here as it is supported
    // but both ws and eio, but let's defer for now.
    setImmediate(() => {
      utils.close_horizon_conn();
      done();
    });
  });
};

const suite = (table) => describe('Protocol', () => all_tests(table));

module.exports = { suite };
