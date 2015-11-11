'use strict';

const utils = require('./utils');

const assert = require('assert');

const suite = (table) => describe('Query', () => all_tests(table));

// TODO: ensure each row is present in the results
const all_tests = (table) => {
  const num_rows = 10;

  before('Clear table', (done) => utils.clear_table(table, done));
  before('Populate table', (done) => utils.populate_table(table, num_rows, done));
  beforeEach('Authenticate client', utils.fusion_default_auth);

  it('table scan', (done) => {
      utils.stream_test(
        {
          request_id: 0,
          type: 'query',
          options: {
            collection: table,
            field_name: 'id',
          },
        },
        (err, res) => {
          assert.ifError(err);
          assert.strictEqual(res.length, num_rows);
          done();
        });
    });

  it('table scan order', (done) => {
      utils.stream_test(
        {
          request_id: 0,
          type: 'query',
          options: {
            collection: table,
            field_name: 'id',
            order: 'ascending',
          },
        },
        (err, res) => {
          assert.ifError(err);
          assert.strictEqual(res.length, num_rows);
          done();
        });
    });

  it('table scan limit', (done) => {
      utils.stream_test(
        {
          request_id: 0,
          type: 'query',
          options: {
            collection: table,
            field_name: 'id',
            limit: 2,
          },
        },
        (err, res) => {
          assert.ifError(err);
          assert.strictEqual(res.length, 2);
          done();
        });
    });

  it('table scan order limit', (done) => {
      utils.stream_test(
        {
          request_id: 0,
          type: 'query',
          options: {
            collection: table,
            field_name: 'id',
            order: 'descending',
            limit: 4,
          },
        },
        (err, res) => {
          assert.ifError(err);
          assert.strictEqual(res.length, 4);
          done();
        });
    });

  it('find_one', (done) => {
      utils.stream_test(
        {
          request_id: 0,
          type: 'query',
          options: {
            collection: table,
            field_name: 'id',
            selection: {
              type: 'find_one',
              args: [ 4 ],
            },
          },
        },
        (err, res) => {
          assert.ifError(err);
          assert.strictEqual(res.length, 1);
          done();
        });
    });

  it('find_one order', (done) => {
      utils.stream_test(
        {
          request_id: 0,
          type: 'query',
          options: {
            collection: table,
            field_name: 'id',
            selection: {
              type: 'find_one',
              args: [ 4 ],
            },
            order: 'ascending',
          },
        },
        (err, res) => {
          assert.deepStrictEqual(res, []);
          utils.check_error(err, '"order" is not allowed');
          done();
        });
    });

  it('find_one limit', (done) => {
      utils.stream_test(
        {
          request_id: 0,
          type: 'query',
          options: {
            collection: table,
            field_name: 'id',
            selection: {
              type: 'find_one',
              args: [ 4 ],
            },
            limit: 5,
          },
        },
        (err, res) => {
          assert.deepStrictEqual(res, []);
          utils.check_error(err, '"limit" is not allowed');
          done();
        });
    });

  it('find', (done) => {
      utils.stream_test(
        {
          request_id: 0,
          type: 'query',
          options: {
            collection: table,
            field_name: 'id',
            selection: {
              type: 'find',
              args: [ 4, 6, 9 ],
            },
          },
        },
        (err, res) => {
          assert.ifError(err);
          assert.strictEqual(res.length, 3);
          done();
        });
    });

  it('find order', (done) => {
      utils.stream_test(
        {
          request_id: 0,
          type: 'query',
          options: {
            collection: table,
            field_name: 'id',
            selection: {
              type: 'find',
              args: [ 1, 2, 4 ],
            },
            order: 'descending',
          },
        },
        (err, res) => {
          assert.deepStrictEqual(res, []);
          utils.check_error(err, '"order" is not allowed');
          done();
        });
    });

  it('find limit', (done) => {
      utils.stream_test(
        {
          request_id: 0,
          type: 'query',
          options: {
            collection: table,
            field_name: 'id',
            selection: {
              type: 'find',
              args: [ 4, 8, 2, 1 ],
            },
            limit: 3,
          },
        },
        (err, res) => {
          assert.ifError(err);
          assert.strictEqual(res.length, 3);
          done();
        });
    });

  it('find order limit', (done) => {
      utils.stream_test(
        {
          request_id: 0,
          type: 'query',
          options: {
            collection: table,
            field_name: 'id',
            selection: {
              type: 'find',
              args: [ 4, 5, 1, 2 ],
            },
            order: 'descending',
            limit: 3,
          },
        },
        (err, res) => {
          assert.deepStrictEqual(res, []);
          utils.check_error(err, '"order" is not allowed');
          done();
        });
    });

  it('between', (done) => {
      utils.stream_test(
        {
          request_id: 0,
          type: 'query',
          options: {
            collection: table,
            field_name: 'id',
            selection: {
              type: 'between',
              args: [ 4, 10 ],
            },
          },
        },
        (err, res) => {
          assert.ifError(err);
          assert.strictEqual(res.length, 6);
          done();
        });
    });

  it('between order', (done) => {
      utils.stream_test(
        {
          request_id: 0,
          type: 'query',
          options: {
            collection: table,
            field_name: 'id',
            selection: {
              type: 'between',
              args: [ 2, 5 ],
            },
            order: 'ascending',
          },
        },
        (err, res) => {
          assert.ifError(err);
          assert.strictEqual(res.length, 3);
          done();
        });
    });

  it('between limit', (done) => {
      utils.stream_test(
        {
          request_id: 0,
          type: 'query',
          options: {
            collection: table,
            field_name: 'id',
            selection: {
              type: 'between',
              args: [ 1, 7 ],
            },
            limit: 1,
          },
        },
        (err, res) => {
          assert.ifError(err);
          assert.strictEqual(res.length, 1);
          done();
        });
    });

  it('between order limit', (done) => {
      utils.stream_test(
        {
          request_id: 0,
          type: 'query',
          options: {
            collection: table,
            field_name: 'id',
            selection: {
              type: 'between',
              args: [ 6, 10 ],
            },
            order: 'ascending',
            limit: 2,
          },
        },
        (err, res) => {
          assert.ifError(err);
          assert.strictEqual(res.length, 2);
          done();
        });
    });
};

module.exports = { suite };
