'use strict';

const utils = require('./utils');

const assert = require('assert');

// Before each test, ids [0, 10) will be present in the table
const num_rows = 10;

const new_row = { id: 10 };
const conflict_row = { id: 0 };
const new_batch = [ { id: 10 }, { id: 11 }, { id: 12 } ];
const conflict_batch = [ { id: 8 }, { id: 9 }, { id: 10 } ];

// TODO: verify through reql that rows have been inserted/removed
const all_tests = (table) => {
  const check_table_size = (expected, done) => {
    done();
  };

  beforeEach('Clear table', (done) => utils.clear_table(table, done));
  beforeEach('Populate table', (done) => utils.populate_table(table, num_rows, done));
  beforeEach('Authenticate', (done) => utils.fusion_default_auth(done));

  it('store new', (done) => {
      utils.stream_test(
        {
          request_id: 0,
          type: 'store',
          options: {
            collection: table,
            data: [ new_row ],
          },
        },
        (err, res) => {
          assert.ifError(err);
          assert.deepStrictEqual(res, [ 10 ]);
          check_table_size(11, done);
        });
    });

  it('store conflict', (done) => {
      utils.stream_test(
        {
          request_id: 0,
          type: 'store',
          options: {
            collection: table,
            data: [ conflict_row ],
          },
        },
        (err, res) => {
          assert.ifError(err);
          assert.deepStrictEqual(res, [ 0 ]);
          check_table_size(10, done);
        });
    });

  it('store batch new', (done) => {
      utils.stream_test(
        {
          request_id: 0,
          type: 'store',
          options: {
            collection: table,
            data: new_batch,
          },
        },
        (err, res) => {
          assert.ifError(err);
          assert.deepStrictEqual(res, [ 10, 11, 12 ]);
          check_table_size(13, done);
        });
    });

  it('store batch conflict', (done) => {
      utils.stream_test(
        {
          request_id: 0,
          type: 'store',
          options: {
            collection: table,
            data: conflict_batch,
          },
        },
        (err, res) => {
          assert.ifError(err);
          assert.deepStrictEqual(res, [ 8, 9, 10 ]);
          check_table_size(11, done);
        });
    });

  it('replace new', (done) => {
      utils.stream_test(
        {
          request_id: 0,
          type: 'replace',
          options: {
            collection: table,
            data: [ new_row ],
          },
        },
        (err, res) => {
          assert.notStrictEqual(err, null);
          assert.strictEqual(err.message, `The document with id 10 was missing.`);
          assert.deepStrictEqual(res, [ ]);
          check_table_size(10, done);
        });
    });

  it('replace conflict', (done) => {
      utils.stream_test(
        {
          request_id: 0,
          type: 'replace',
          options: {
            collection: table,
            data: [ conflict_row ],
          },
        },
        (err, res) => {
          assert.ifError(err);
          assert.deepStrictEqual(res, [ 0 ]);
          check_table_size(10, done);
        });
    });

  it('replace batch new', (done) => {
      utils.stream_test(
        {
          request_id: 0,
          type: 'replace',
          options: {
            collection: table,
            data: new_batch,
          },
        },
        (err, res) => {
          assert.notStrictEqual(err, null);
          assert.strictEqual(err.message, `The document with id 10 was missing.`);
          assert.deepStrictEqual(res, [ ]);
          check_table_size(10, done);
        });
    });

  it('replace batch conflict', (done) => {
      utils.stream_test(
        {
          request_id: 0,
          type: 'replace',
          options: {
            collection: table,
            data: conflict_batch,
          },
        },
        (err, res) => {
          assert.notStrictEqual(err, null);
          assert.strictEqual(err.message, `The document with id 10 was missing.`);
          assert.deepStrictEqual(res, [ ]);
          check_table_size(10, done);
        });
    });

  it('upsert new', (done) => {
      utils.stream_test(
        {
          request_id: 0,
          type: 'upsert',
          options: {
            collection: table,
            data: [ new_row ],
          },
        },
        (err, res) => {
          assert.ifError(err);
          assert.deepStrictEqual(res, [ 10 ]);
          check_table_size(11, done);
        });
    });

  it('upsert conflict', (done) => {
      utils.stream_test(
        {
          request_id: 0,
          type: 'upsert',
          options: {
            collection: table,
            data: [ conflict_row ],
          },
        },
        (err, res) => {
          assert.ifError(err);
          assert.deepStrictEqual(res, [ 0 ]);
          check_table_size(11, done);
        });
    });

  it('upsert batch new', (done) => {
      utils.stream_test(
        {
          request_id: 0,
          type: 'upsert',
          options: {
            collection: table,
            data: new_batch,
          },
        },
        (err, res) => {
          assert.ifError(err);
          assert.deepStrictEqual(res, [ 10, 11, 12 ]);
          check_table_size(11, done);
        });
    });

  it('upsert batch conflict', (done) => {
      utils.stream_test(
        {
          request_id: 0,
          type: 'upsert',
          options: {
            collection: table,
            data: conflict_batch,
          },
        },
        (err, res) => {
          assert.ifError(err);
          assert.deepStrictEqual(res, [ 8, 9, 10 ]);
          check_table_size(11, done);
        });
    });

  it('update new', (done) => {
      utils.stream_test(
        {
          request_id: 0,
          type: 'update',
          options: {
            collection: table,
            data: [ new_row ],
          },
        },
        (err, res) => {
          assert.notStrictEqual(err, null);
          assert.strictEqual(err.message, `The document with id 10 was missing.`);
          assert.deepStrictEqual(res, [ ]);
          check_table_size(10, done);
        });
    });

  it('update conflict', (done) => {
      utils.stream_test(
        {
          request_id: 0,
          type: 'update',
          options: {
            collection: table,
            data: [ conflict_row ],
          },
        },
        (err, res) => {
          assert.ifError(err);
          assert.deepStrictEqual(res, [ 0 ]);
          check_table_size(11, done);
        });
    });

  it('update batch new', (done) => {
      utils.stream_test(
        {
          request_id: 0,
          type: 'update',
          options: {
            collection: table,
            data: new_batch,
          },
        },
        (err, res) => {
          assert.notStrictEqual(err, null);
          assert.strictEqual(err.message, `The document with id 10 was missing.`);
          assert.deepStrictEqual(res, [ ]);
          check_table_size(10, done);
        });
    });

  it('update batch conflict', (done) => {
      utils.stream_test(
        {
          request_id: 0,
          type: 'update',
          options: {
            collection: table,
            data: conflict_batch,
          },
        },
        (err, res) => {
          assert.notStrictEqual(err, null);
          assert.strictEqual(err.message, `The document with id 10 was missing.`);
          assert.deepStrictEqual(res, [ ]);
          check_table_size(11, done);
        });
    });

  it('insert new', (done) => {
      utils.stream_test(
        {
          request_id: 0,
          type: 'insert',
          options: {
            collection: table,
            data: [ new_row ],
          },
        },
        (err, res) => {
          assert.ifError(err);
          assert.deepStrictEqual(res, [ 10 ]);
          check_table_size(11, done);
        });
    });

  it('insert conflict', (done) => {
      utils.stream_test(
        {
          request_id: 0,
          type: 'insert',
          options: {
            collection: table,
            data: [ conflict_row ],
          },
        },
        (err, res) => {
          assert.notStrictEqual(err, null);
          utils.check_error(err, 'Duplicate primary key');
          assert.deepStrictEqual(res, [ ]);
          check_table_size(10, done);
        });
    });

  it('insert batch new', (done) => {
      utils.stream_test(
        {
          request_id: 0,
          type: 'insert',
          options: {
            collection: table,
            data: new_batch,
          },
        },
        (err, res) => {
          assert.ifError(err);
          assert.deepStrictEqual(res, [ 10, 11, 12 ]);
          check_table_size(11, done);
        });
    });

  it('insert batch conflict', (done) => {
      utils.stream_test(
        {
          request_id: 0,
          type: 'insert',
          options: {
            collection: table,
            data: conflict_batch,
          },
        },
        (err, res) => {
          assert.notStrictEqual(err, null);
          utils.check_error(err, 'Duplicate primary key');
          assert.deepStrictEqual(res, [ ]);
          check_table_size(11, done);
        });
    });

  it('remove new', (done) => {
      utils.stream_test(
        {
          request_id: 0,
          type: 'remove',
          options: {
            collection: table,
            data: [ new_row ],
          },
        },
        (err, res) => {
          assert.ifError(err);
          assert.deepStrictEqual(res, [ 10 ]);
          check_table_size(10, done);
        });
    });

  it('remove conflict', (done) => {
      utils.stream_test(
        {
          request_id: 0,
          type: 'remove',
          options: {
            collection: table,
            data: [ conflict_row ],
          },
        },
        (err, res) => {
          assert.ifError(err);
          assert.deepStrictEqual(res, [ 0 ]);
          check_table_size(9, done);
        });
    });

  it('remove batch new', (done) => {
      utils.stream_test(
        {
          request_id: 0,
          type: 'remove',
          options: {
            collection: table,
            data: new_batch,
          },
        },
        (err, res) => {
          assert.ifError(err);
          assert.deepStrictEqual(res, [ 10, 11, 12 ]);
          check_table_size(10, done);
        });
    });

  it('remove batch conflict', (done) => {
      utils.stream_test(
        {
          request_id: 0,
          type: 'remove',
          options: {
            collection: table,
            data: conflict_batch,
          },
        },
        (err, res) => {
          assert.ifError(err);
          assert.deepStrictEqual(res, [ 8, 9, 10 ]);
          check_table_size(8, done);
        });
    });
};

const suite = (table) => describe('Write', () => all_tests(table));

module.exports = { suite };
