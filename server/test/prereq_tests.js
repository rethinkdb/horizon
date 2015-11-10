'use strict'

const utils = require('./utils.js');

const assert = require('assert');
const crypto = require('crypto');
const r      = require('rethinkdb');

module.exports.name = 'Prereqs';

module.exports.all_tests = (table) => {
  beforeEach('authenticate', (done) => utils.fusion_default_auth(done));

  // Launch simultaneous queries that depend on a non-existent table, then
  // verify that only one table exists with that name.
  it('table create race', (done) => {
      const query_count = 5;
      var table_name = crypto.randomBytes(8).toString('hex');

      var finished = 0;
      for (var i = 0; i < query_count; ++i) {
        utils.stream_test(
          { request_id: i, type: 'query', options: { collection: table_name } },
          (err, res) => {
            assert.ifError(err);
            assert.strictEqual(res.length, 0);
            if (++finished == query_count) {
              r.table(table_name).count().run(utils.rdb_conn())
               .then((res) => (assert.strictEqual(res, 0), done()),
                     (err) => done(err));
            }
          });
      }
    });

  // Launch two simultaneous queries that depend on a non-existent index, then
  // verify that only one such index exists with that name.
  it('index create race', (done) => {
      var index_name = crypto.randomBytes(8).toString('hex');
      done();
    });
};
