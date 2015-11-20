'use strict';

const utils = require('./utils');

const assert = require('assert');

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
          order: [ [ 'id' ], 'ascending' ],
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
          order: [ [ 'id' ], 'descending' ],
          limit: 4,
        },
      },
      (err, res) => {
        assert.ifError(err);
        assert.strictEqual(res.length, 4);
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
          find: { id: 4 },
        },
      },
      (err, res) => {
        assert.ifError(err);
        assert.strictEqual(res.length, 1);
        done();
      });
  });

  it('find missing', (done) => {
    utils.stream_test(
      {
        request_id: 0,
        type: 'query',
        options: {
          collection: table,
          find: { id: 14 },
        },
      },
      (err, res) => {
        assert.ifError(err);
        assert.deepStrictEqual(res, [ ]);
        done();
      });
  });

  it('find_all', (done) => {
    utils.stream_test(
      {
        request_id: 0,
        type: 'query',
        options: {
          collection: table,
          find_all: [ { id: 4 }, { id: 6 }, { id: 9 } ],
        },
      },
      (err, res) => {
        assert.ifError(err);
        assert.strictEqual(res.length, 3);
        done();
      });
  });

  it('find_all order', (done) => {
    utils.stream_test(
      {
        request_id: 0,
        type: 'query',
        options: {
          collection: table,
          find_all: [ { id: 1 } ],
          order: [ [ 'id' ], 'descending' ],
        },
      },
      (err, res) => {
        assert.ifError(err);
        assert.strictEqual(res.length, 1);
        done();
      });
  });

  it('find_all limit', (done) => {
    utils.stream_test(
      {
        request_id: 0,
        type: 'query',
        options: {
          collection: table,
          find_all: [ { id: 4 }, { id: 8 }, { id: 2 }, { id: 1 } ],
          limit: 3,
        },
      },
      (err, res) => {
        assert.ifError(err);
        assert.strictEqual(res.length, 3);
        done();
      });
  });

  it('find_all order limit', (done) => {
    utils.stream_test(
      {
        request_id: 0,
        type: 'query',
        options: {
          collection: table,
          find_all: [ { id: 4 } ],
          order: [ [ 'id' ], 'descending' ],
          limit: 3,
        },
      },
      (err, res) => {
        assert.ifError(err);
        assert.strictEqual(res.length, 1);
        done();
      });
  });
};

const suite = (table) => describe('Query', () => all_tests(table));

module.exports = { suite };
