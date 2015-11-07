'use strict'

const utils = require('./utils.js');

const assert = require('assert');
const crypto = require('crypto');
const r      = require('rethinkdb');

const table = 'prereq_test';

module.exports.name = 'Prereqs';

module.exports.prepare_database = (done) => {
  var c = utils.rdb_conn();
  r.tableCreate(table).run(c)
   .then((res) => {
        assert.equal(res.tables_created, 1);
        done();
      });
};

module.exports.all_tests = () => {
  // Launch simultaneous queries that depend on a non-existent table, then
  // verify that only one table exists with that name.
  it('table create race', (done) => {
      const query_count = 5;
      var table_name = crypto.randomBytes(6).toString('base64');

      var finished = 0;
      var collector = () => {
          if (++finished == query_count) {
            r.table(table_name).count().run(utils.rdb_conn())
             .then((res) => (assert.equal(res, 0), done()),
                   (err) => done(err));
          }
        };

      for (var i = 0; i < query_count; ++i) {
        utils.stream_test(
          { request_id: i, type: 'query', options: { collection: table_name } },
          (err, res) => {
            assert.ifError(err);
            assert.equal(res.length, 0);
            collector();
          });
      }
    });

  // Launch two simultaneous queries that depend on a non-existent table, then
  // verify that only one table exists with that name.
  it('index create race', (done) => {
      var index_name = crypto.randomBytes(6).toString('base64');
      done();
    });
};
