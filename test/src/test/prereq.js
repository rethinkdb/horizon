'use strict';

const utils = require('./utils');

const assert = require('assert');
const crypto = require('crypto');

const allTests = (collection) => {
  beforeEach('clear collection', () => utils.clearCollection(collection));
  beforeEach('authenticate', (done) => utils.horizonTokenAuth('admin', done));

  // Launch simultaneous queries that depend on a non-existent collection, then
  // verify that only one table exists for that collection.
  it('collection create race on read', (done) => {
    const queryCount = 5;
    const randCollection = crypto.randomBytes(8).toString('hex');

    let finished = 0;
    for (let i = 0; i < queryCount; ++i) {
      utils.streamTest(
        {requestId: i, options: {collection: [randCollection], fetch: []}},
        (err, res) => {
          assert.ifError(err);
          assert.strictEqual(res.length, 0);
          if (++finished === queryCount) {
            utils.table(randCollection).count().run(utils.rdbConn()).then((count) => {
              assert.strictEqual(count, 0);
              done();
            }).catch(done);
          }
        });
    }
  });

  // Same as the previous test, but it exists because the ReQL error message
  // is different for a read or a write when the table is unavailable.
  it('collection create race on write', (done) => {
    const queryCount = 5;
    const randCollection = crypto.randomBytes(8).toString('hex');

    let finished = 0;
    for (let i = 0; i < queryCount; ++i) {
      utils.streamTest(
        {
          requestId: i,
          options: {
            collection: [randCollection],
            insert: [{}],
          },
        },
        (err, res) => {
          assert.ifError(err);
          assert.strictEqual(res.length, 1);
          if (++finished === queryCount) {
            utils.table(randCollection).count().run(utils.rdbConn()).then((count) => {
              assert.strictEqual(count, queryCount);
              done();
            }).catch(done);
          }
        });
    }
  });

  // Launch two simultaneous queries that depend on a non-existent index, then
  // verify that only one such index exists with that name.
  it('index create race', (done) => {
    const queryCount = 5;
    const fieldName = crypto.randomBytes(8).toString('hex');
    const conn = utils.rdbConn();

    utils.table(collection).indexStatus().count().run(conn).then((oldCount) => {
      let finished = 0;
      for (let i = 0; i < queryCount; ++i) {
        utils.streamTest(
          {
            requestId: i,
            options: {
              collection: [collection],
              order: [[fieldName], 'ascending'],
              fetch: [],
            },
          },
          (err, res) => {
            assert.ifError(err);
            assert.strictEqual(res.length, 0);
            if (++finished === queryCount) {
              utils.table(collection).indexStatus().count().run(conn).then((newCount) => {
                assert.strictEqual(oldCount + 1, newCount);
                done();
              }).catch(done);
            }
          });
      }
    });
  });
};

const suite = (collection) => describe('Prereqs', () => allTests(collection));

module.exports = {suite};
