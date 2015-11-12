'use strict';

const utils = require('./utils');

const assert = require('assert');
const crypto = require('crypto');
const r = require('rethinkdb');

const all_tests = (table) => {
  beforeEach('authenticate', (done) => utils.fusion_default_auth(done));

  // Launch simultaneous queries that depend on a non-existent table, then
  // verify that only one table exists with that name.
  it('table create race on read', (done) => {
      const query_count = 5;
      var table_name = crypto.randomBytes(8).toString('hex');

      var finished = 0;
      for (var i = 0; i < query_count; ++i) {
        utils.stream_test(
          { request_id: i, type: 'query', options: { collection: table_name, field_name: 'id' } },
          (err, res) => {
            assert.ifError(err);
            assert.strictEqual(res.length, 0);
            if (++finished === query_count) {
              r.table(table_name).count().run(utils.rdb_conn())
               .then((count) => (assert.strictEqual(count, 0), done()),
                     (error) => done(error));
            }
          });
      }
    });

  // Same as the previous test, but it exists because the ReQL error message
  // is different for a read or a write when the table is unavailable.
  it('table create race on write', (done) => {
      const query_count = 5;
      var table_name = crypto.randomBytes(8).toString('hex');

      var finished = 0;
      for (var i = 0; i < query_count; ++i) {
        utils.stream_test(
          {
            request_id: i,
            type: 'insert',
            options: {
              collection: table_name,
              data: [{}],
            },
          },
          (err, res) => {
            assert.ifError(err);
            assert.strictEqual(res.length, 1);
            if (++finished === query_count) {
              r.table(table_name).count().run(utils.rdb_conn())
               .then((count) => (assert.strictEqual(count, query_count), done()),
                     (error) => done(error));
            }
          });
      }
    });

  // Launch two simultaneous queries that depend on a non-existent index, then
  // verify that only one such index exists with that name.
  it('index create race', (done) => {
      var index_name = crypto.randomBytes(8).toString('hex');
      var query_count = 5;

      var finished = 0;
      for (var i = 0; i < query_count; ++i) {
        utils.stream_test(
          {
            request_id: i,
            type: 'query',
            options: {
              collection: table,
              field_name: index_name,
              order: 'ascending',
            },
          },
          (err, res) => {
            assert.ifError(err);
            assert.strictEqual(res.length, 0);
            if (++finished === query_count) {
              r.table(table).indexStatus(index_name).run(utils.rdb_conn())
               .then(
                 (statuses) => {
                   assert.strictEqual(statuses.length, 1);
                   assert(statuses[0].ready);
                   done();
                 },
                 (error) => done(error));
            }
          });
      }
    });
};

const suite = (table) => describe('Prereqs', () => all_tests(table));

module.exports = { suite };
