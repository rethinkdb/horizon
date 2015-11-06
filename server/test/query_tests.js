'use strict';

const utils = require('./utils.js');

const assert = require('assert');
const r      = require('rethinkdb');

const table = 'test_query';
const num_rows = 10;

module.exports.name = 'Query';

module.exports.prepare_database = (done) => {
  var c = utils.rdb_conn();
  r.tableCreate(table).run(c)
   .then((res) => {
        assert.equal(res.tables_created, 1);
        return r.table(table).insert(r.range(num_rows).map((row) => ({ id: row }))).run(c);
      })
   .then((res) => {
        assert.equal(res.inserted, num_rows);
        done();
      });
};

module.exports.all_tests = () => {
  beforeEach('Authenticate client', utils.fusion_default_auth);

  it('table scan', (done) => {
      // TODO: function to collect all results for a given request_id into an array
      utils.stream_test(
        { request_id: 0, type: 'query', options: { collection: table } },
        (err, res) => {
          assert.ifError(err);
          assert.equal(res.length, num_rows);
          // TODO: ensure each row is present in the results
          done();
        });
    });

  it('find_one', (done) => { done(); });
  it('find_one order', (done) => { done(); });
  it('find_one limit', (done) => { done(); });
  it('find_one order limit', (done) => { done(); });
  it('find', (done) => { done(); });
  it('find order', (done) => { done(); });
  it('find limit', (done) => { done(); });
  it('find order limit', (done) => { done(); });
  it('between', (done) => { done(); });
  it('between order', (done) => { done(); });
  it('between limit', (done) => { done(); });
  it('between order limit', (done) => { done(); });
};
