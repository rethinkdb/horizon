'use strict';

const utils = require('./utils');

const assert = require('assert');
const crypto = require('crypto');

const all_tests = (collection) => {
  beforeEach('clear collection', () => utils.clear_collection(collection));
  beforeEach('authenticate', (done) => utils.horizon_token_auth('admin', done));

  // Launch simultaneous queries that depend on a non-existent collection, then
  // verify that only one table exists for that collection.
  it('collection create race on read', (done) => {
    const query_count = 5;
    const rand_collection = crypto.randomBytes(8).toString('hex');

    let finished = 0;
    for (let i = 0; i < query_count; ++i) {
      utils.stream_test(
        {request_id: i, options: {collection: [rand_collection], fetch: []}},
        (err, res) => {
          assert.ifError(err);
          assert.strictEqual(res.length, 0);
          if (++finished === query_count) {
            utils.table(rand_collection).count().run(utils.rdb_conn()).then((count) => {
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
    const query_count = 5;
    const rand_collection = crypto.randomBytes(8).toString('hex');

    let finished = 0;
    for (let i = 0; i < query_count; ++i) {
      utils.stream_test(
        {
          request_id: i,
          options: {
            collection: [rand_collection],
            insert: [{}],
          },
        },
        (err, res) => {
          assert.ifError(err);
          assert.strictEqual(res.length, 1);
          if (++finished === query_count) {
            utils.table(rand_collection).count().run(utils.rdb_conn()).then((count) => {
              assert.strictEqual(count, query_count);
              done();
            }).catch(done);
          }
        });
    }
  });

  // Launch two simultaneous queries that depend on a non-existent index, then
  // verify that only one such index exists with that name.
  it('index create race', (done) => {
    const query_count = 5;
    const field_name = crypto.randomBytes(8).toString('hex');
    const conn = utils.rdb_conn();

    utils.table(collection).indexStatus().count().run(conn).then((old_count) => {
      let finished = 0;
      for (let i = 0; i < query_count; ++i) {
        utils.stream_test(
          {
            request_id: i,
            options: {
              collection: [collection],
              order: [[field_name], 'ascending'],
              fetch: [],
            },
          },
          (err, res) => {
            assert.ifError(err);
            assert.strictEqual(res.length, 0);
            if (++finished === query_count) {
              utils.table(collection).indexStatus().count().run(conn).then((new_count) => {
                assert.strictEqual(old_count + 1, new_count);
                done();
              }).catch(done);
            }
          });
      }
    });
  });
};

const suite = (collection) => describe('Prereqs', () => all_tests(collection));

module.exports = {suite};
