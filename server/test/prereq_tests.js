'use strict';

const utils = require('./utils');

const assert = require('assert');
const crypto = require('crypto');
const r = require('rethinkdb');

const all_tests = (table) => {
  beforeEach('clear table', (done) => utils.clear_table(table, done));
  beforeEach('authenticate', (done) => utils.fusion_default_auth(done));

  // Launch simultaneous queries that depend on a non-existent table, then
  // verify that only one table exists with that name.
  it('table create race on read', function (done) {
    this.timeout(5000);
    const query_count = 5;
    const table_name = crypto.randomBytes(8).toString('hex');

    let finished = 0;
    for (let i = 0; i < query_count; ++i) {
      utils.stream_test(
        { request_id: i, type: 'query', options: { collection: table_name } },
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
  it('table create race on write', function (done) {
    this.timeout(5000);
    const query_count = 5;
    const table_name = crypto.randomBytes(8).toString('hex');

    let finished = 0;
    for (let i = 0; i < query_count; ++i) {
      utils.stream_test(
        {
          request_id: i,
          type: 'insert',
          options: {
            collection: table_name,
            data: [ { } ],
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
    const query_count = 5;
    const field_name = crypto.randomBytes(8).toString('hex');
    const conn = utils.rdb_conn();

    r.table(table).indexStatus().count().run(conn).then((old_count) => {
      let finished = 0;
      for (let i = 0; i < query_count; ++i) {
        utils.stream_test(
          {
            request_id: i,
            type: 'query',
            options: {
              collection: table,
              order: [ [ field_name ], 'ascending' ],
            },
          },
          (err, res) => {
            assert.ifError(err);
            assert.strictEqual(res.length, 0);
            if (++finished === query_count) {
              r.table(table).indexStatus().count().run(conn).then((new_count) => {
                assert.strictEqual(old_count + 1, new_count);
                done();
              }, (err2) => done(err2));
            }
          });
      }
    });
  });
};

const suite = (table) => describe('Prereqs', () => all_tests(table));

module.exports = { suite };
