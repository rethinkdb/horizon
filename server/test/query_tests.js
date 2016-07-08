'use strict';

const utils = require('./utils');

const assert = require('assert');

// TODO: ensure each row is present in the results
const all_tests = (collection) => {
  const num_rows = 10;

  before('Clear collection', (done) => utils.clear_collection(collection, done));
  before('Populate collection', (done) => utils.populate_collection(collection, num_rows, done));
  beforeEach('Authenticate client', utils.horizon_admin_auth);

  it('collection scan.', (done) => {
    utils.stream_test(
      {
        request_id: 0,
        type: 'query',
        options: { collection },
      },
      (err, res) => {
        assert.ifError(err);
        assert.strictEqual(res.length, num_rows);
        done();
      });
  });

  it('collection scan order.', (done) => {
    utils.stream_test(
      {
        request_id: 0,
        type: 'query',
        options: {
          collection,
          order: [ [ 'id' ], 'ascending' ],
        },
      },
      (err, res) => {
        assert.ifError(err);
        assert.strictEqual(res.length, num_rows);
        done();
      });
  });

  it('collection scan limit.', (done) => {
    utils.stream_test(
      {
        request_id: 0,
        type: 'query',
        options: {
          collection,
          limit: 2,
        },
      },
      (err, res) => {
        assert.ifError(err);
        assert.strictEqual(res.length, 2);
        done();
      });
  });

  it('collection scan order limit.', (done) => {
    utils.stream_test(
      {
        request_id: 0,
        type: 'query',
        options: {
          collection,
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

  it('collection scan above.', (done) => {
    utils.stream_test(
      {
        request_id: 0,
        type: 'query',
        options: {
          collection,
          above: [ { id: 5 }, 'closed' ],
        },
      },
      (err, res) => {
        assert.ifError(err);
        assert.strictEqual(res.length, 5);
        done();
      });
  });

  it('collection scan below.', (done) => {
    utils.stream_test(
      {
        request_id: 0,
        type: 'query',
        options: {
          collection,
          below: [ { id: 5 }, 'closed' ],
        },
      },
      (err, res) => {
        assert.ifError(err);
        assert.strictEqual(res.length, 6);
        done();
      });
  });

  it('collection scan above below.', (done) => {
    utils.stream_test(
      {
        request_id: 0,
        type: 'query',
        options: {
          collection,
          above: [ { id: 5 }, 'open' ],
          below: [ { id: 7 }, 'open' ],
        },
      },
      (err, res) => {
        assert.ifError(err);
        assert.strictEqual(res.length, 1);
        done();
      });
  });

  it('find.', (done) => {
    utils.stream_test(
      {
        request_id: 0,
        type: 'query',
        options: {
          collection,
          find: { id: 4 },
        },
      },
      (err, res) => {
        assert.ifError(err);
        assert.strictEqual(res.length, 1);
        done();
      });
  });

  it('find missing.', (done) => {
    utils.stream_test(
      {
        request_id: 0,
        type: 'query',
        options: {
          collection,
          find: { id: 14 },
        },
      },
      (err, res) => {
        assert.ifError(err);
        assert.deepStrictEqual(res, [ ]);
        done();
      });
  });

  it('find_all.', (done) => {
    utils.stream_test(
      {
        request_id: 0,
        type: 'query',
        options: {
          collection,
          find_all: [ { id: 4 }, { id: 6 }, { id: 9 } ],
        },
      },
      (err, res) => {
        assert.ifError(err);
        assert.strictEqual(res.length, 3);
        done();
      });
  });

  it('find_all order.', (done) => {
    utils.stream_test(
      {
        request_id: 0,
        type: 'query',
        options: {
          collection,
          find_all: [ { id: 1 } ],
          order: [ [ 'value' ], 'descending' ],
        },
      },
      (err, res) => {
        assert.ifError(err);
        assert.strictEqual(res.length, 1);
        done();
      });
  });

  it('find_all limit.', (done) => {
    utils.stream_test(
      {
        request_id: 0,
        type: 'query',
        options: {
          collection,
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

  it('find_all order limit.', (done) => {
    utils.stream_test(
      {
        request_id: 0,
        type: 'query',
        options: {
          collection,
          find_all: [ { id: 4 } ],
          order: [ [ 'value' ], 'descending' ],
          limit: 3,
        },
      },
      (err, res) => {
        assert.ifError(err);
        assert.strictEqual(res.length, 1);
        done();
      });
  });

  it('find_all above.', (done) => {
    utils.stream_test(
      {
        request_id: 0,
        type: 'query',
        options: {
          collection,
          find_all: [ { value: 1 } ],
          above: [ { id: 3 }, 'open' ],
        },
      },
      (err, res) => {
        assert.ifError(err);
        assert.strictEqual(res.length, 2);
        done();
      });
  });

  it('find_all below.', (done) => {
    utils.stream_test(
      {
        request_id: 0,
        type: 'query',
        options: {
          collection,
          find_all: [ { value: 1 } ],
          below: [ { id: 5 }, 'open' ],
        },
      },
      (err, res) => {
        assert.ifError(err);
        assert.strictEqual(res.length, 1);
        done();
      });
  });

  it('find_all above below.', (done) => {
    utils.stream_test(
      {
        request_id: 0,
        type: 'query',
        options: {
          collection,
          find_all: [ { value: 1 } ],
          above: [ { id: 1 }, 'closed' ],
          below: [ { id: 9 }, 'open' ],
        },
      },
      (err, res) => {
        assert.ifError(err);
        assert.strictEqual(res.length, 2);
        done();
      });
  });

  it('find_all order above.', (done) => {
    utils.stream_test(
      {
        request_id: 0,
        type: 'query',
        options: {
          collection,
          find_all: [ { value: 1 } ],
          order: [ [ 'id' ], 'ascending' ],
          above: [ { id: 7 }, 'open' ],
        },
      },
      (err, res) => {
        assert.ifError(err);
        assert.strictEqual(res.length, 1);
        done();
      });
  });

  it('find_all order below.', (done) => {
    utils.stream_test(
      {
        request_id: 0,
        type: 'query',
        options: {
          collection,
          find_all: [ { value: 0 } ],
          order: [ [ 'id' ], 'descending' ],
          below: [ { id: 8 }, 'open' ],
        },
      },
      (err, res) => {
        assert.ifError(err);
        assert.strictEqual(res.length, 2);
        done();
      });
  });

  it('find_all order above below.', (done) => {
    utils.stream_test(
      {
        request_id: 0,
        type: 'query',
        options: {
          collection,
          find_all: [ { value: 0 } ],
          order: [ [ 'id' ], 'descending' ],
          above: [ { id: 3 }, 'closed' ],
          below: [ { id: 9 }, 'closed' ],
        },
      },
      (err, res) => {
        assert.ifError(err);
        assert.strictEqual(res.length, 2);
        done();
      });
  });

  // These tests are impossible to represent in the schema (as far as I can tell),
  // so the test for this functionality must be at the integration level.
  it('find_all "above" field not in "order".', (done) => {
    utils.stream_test(
      {
        request_id: 0,
        type: 'query',
        options: {
          collection,
          find_all: [ { value: 0 } ],
          order: [ [ 'value', 'a' ], 'descending' ],
          above: [ { b: 4 }, 'closed' ],
        },
      },
      (err) => {
        utils.check_error(err, '"above" must be on the same field as the first in "order"');
        done();
      });
  });

  it('find_all "above" field not first in "order".', (done) => {
    utils.stream_test(
      {
        request_id: 0,
        type: 'query',
        options: {
          collection,
          find_all: [ { value: 0 } ],
          order: [ [ 'value', 'a' ], 'descending' ],
          above: [ { a: 4 }, 'closed' ],
        },
      },
      (err) => {
        utils.check_error(err, '"above" must be on the same field as the first in "order"');
        done();
      });
  });

  it('find_all "below" field not in "order".', (done) => {
    utils.stream_test(
      {
        request_id: 0,
        type: 'query',
        options: {
          collection,
          find_all: [ { value: 0 } ],
          order: [ [ 'value', 'a' ], 'descending' ],
          below: [ { b: 4 }, 'closed' ],
        },
      },
      (err) => {
        utils.check_error(err, '"below" must be on the same field as the first in "order"');
        done();
      });
  });

  it('find_all "below" field not first in "order".', (done) => {
    utils.stream_test(
      {
        request_id: 0,
        type: 'query',
        options: {
          collection,
          find_all: [ { value: 0 } ],
          order: [ [ 'value', 'a' ], 'descending' ],
          below: [ { a: 4 }, 'closed' ],
        },
      },
      (err) => {
        utils.check_error(err, '"below" must be on the same field as the first in "order"');
        done();
      });
  });
};

const suite = (collection) => describe('Query', () => all_tests(collection));

module.exports = { suite };
