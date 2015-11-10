'use strict';

const utils = require('./utils.js');

const assert = require('assert');

module.exports.name = 'Write';


// Before each test, ids [0, 10) will be present in the table
const num_rows = 10;

const new_row = { id: 10 };
const new_batch = [ { id: 10 }, { id: 11 }, { id: 12 } ];
const conflict_row = { id: 0 };
const conflict_batch = [ { id: 8 }, { id: 9 }, { id: 10 } ];

// TODO: verify through reql that rows have been inserted/removed
module.exports.all_tests = (table) => {
  var check_table_size = (expected, done) => {
    done();
  };

  beforeEach('Clear table', (done) => utils.clear_table(table, done));
  beforeEach('Populate table', (done) => utils.populate_table(table, num_rows, done));
  beforeEach('Authenticate', (done) => utils.fusion_default_auth(done));

  it('store replace insert new', (done) => {
      utils.stream_test(
        {
          request_id: 0,
          type: 'store',
          options: {
            collection: table,
            data: [ new_row ],
            conflict: 'replace',
            missing: 'insert',
          },
        },
        (err, res) => {
          assert.ifError(err);
          check_table_size(11, done);
        });
    });

  it('store replace insert conflict', (done) => {
      utils.stream_test(
        {
          request_id: 0,
          type: 'store',
          options: {
            collection: table,
            data: [ conflict_row ],
            conflict: 'replace',
            missing: 'insert',
          },
        },
        (err, res) => {
          assert.ifError(err);
          check_table_size(10, done);
        });
    });

  it('store replace insert batch new', (done) => {
      utils.stream_test(
        {
          request_id: 0,
          type: 'store',
          options: {
            collection: table,
            data: new_batch,
            conflict: 'replace',
            missing: 'insert',
          },
        },
        (err, res) => {
          assert.ifError(err);
          check_table_size(13, done);
        });
    });

  it('store replace insert batch conflict', (done) => {
      utils.stream_test(
        {
          request_id: 0,
          type: 'store',
          options: {
            collection: table,
            data: conflict_batch,
            conflict: 'replace',
            missing: 'insert',
          },
        },
        (err, res) => {
          assert.ifError(err);
          check_table_size(11, done);
        });
    });

  it('store replace error new', (done) => {
      utils.stream_test(
        {
          request_id: 0,
          type: 'store',
          options: {
            collection: table,
            data: [ new_row ],
            conflict: 'replace',
            missing: 'error',
          },
        },
        (err, res) => {
          assert.notStrictEqual(err, null);
          assert.strictEqual(err.message, "'options.missing' was 'error' and a document was missing from the database.");
          check_table_size(10, done);
        });
    });

  it('store replace error conflict', (done) => {
      utils.stream_test(
        {
          request_id: 0,
          type: 'store',
          options: {
            collection: table,
            data: [ conflict_row ],
            conflict: 'replace',
            missing: 'error',
          },
        },
        (err, res) => {
          assert.ifError(err);
          check_table_size(10, done);
        });
    });

  it('store replace error batch new', (done) => {
      utils.stream_test(
        {
          request_id: 0,
          type: 'store',
          options: {
            collection: table,
            data: new_batch,
            conflict: 'replace',
            missing: 'error',
          },
        },
        (err, res) => {
          assert.notStrictEqual(err, null);
          assert.strictEqual(err.message, "'options.missing' was 'error' and a document was missing from the database.");
          check_table_size(10, done);
        });
    });

  it('store replace error batch conflict', (done) => {
      utils.stream_test(
        {
          request_id: 0,
          type: 'store',
          options: {
            collection: table,
            data: conflict_batch,
            conflict: 'replace',
            missing: 'error',
          },
        },
        (err, res) => {
          assert.notStrictEqual(err, null);
          assert.strictEqual(err.message, "'options.missing' was 'error' and a document was missing from the database.");
          check_table_size(10, done);
        });
    });

  it('store update insert new', (done) => {
      utils.stream_test(
        {
          request_id: 0,
          type: 'store',
          options: {
            collection: table,
            data: [ new_row ],
            conflict: 'update',
            missing: 'insert',
          },
        },
        (err, res) => {
          assert.ifError(err);
          check_table_size(11, done);
        });
    });

  it('store update insert conflict', (done) => {
      utils.stream_test(
        {
          request_id: 0,
          type: 'store',
          options: {
            collection: table,
            data: [ conflict_row ],
            conflict: 'update',
            missing: 'insert',
          },
        },
        (err, res) => {
          assert.ifError(err);
          check_table_size(11, done);
        });
    });

  it('store update insert batch new', (done) => {
      utils.stream_test(
        {
          request_id: 0,
          type: 'store',
          options: {
            collection: table,
            data: new_batch,
            conflict: 'update',
            missing: 'insert',
          },
        },
        (err, res) => {
          assert.ifError(err);
          check_table_size(11, done);
        });
    });

  it('store update insert batch conflict', (done) => {
      utils.stream_test(
        {
          request_id: 0,
          type: 'store',
          options: {
            collection: table,
            data: conflict_batch,
            conflict: 'update',
            missing: 'insert',
          },
        },
        (err, res) => {
          assert.ifError(err);
          check_table_size(11, done);
        });
    });

  it('store update error new', (done) => {
      utils.stream_test(
        {
          request_id: 0,
          type: 'store',
          options: {
            collection: table,
            data: [ new_row ],
            conflict: 'update',
            missing: 'error',
          },
        },
        (err, res) => {
          assert.notStrictEqual(err, null);
          assert.strictEqual(err.message, "'options.missing' was 'error' and a document was missing from the database.");
          check_table_size(10, done);
        });
    });

  it('store update error conflict', (done) => {
      utils.stream_test(
        {
          request_id: 0,
          type: 'store',
          options: {
            collection: table,
            data: [ conflict_row ],
            conflict: 'update',
            missing: 'error',
          },
        },
        (err, res) => {
          assert.ifError(err);
          check_table_size(11, done);
        });
    });

  it('store update error batch new', (done) => {
      utils.stream_test(
        {
          request_id: 0,
          type: 'store',
          options: {
            collection: table,
            data: new_batch,
            conflict: 'update',
            missing: 'error',
          },
        },
        (err, res) => {
          assert.notStrictEqual(err, null);
          assert.strictEqual(err.message, "'options.missing' was 'error' and a document was missing from the database.");
          check_table_size(10, done);
        });
    });

  it('store update error batch conflict', (done) => {
      utils.stream_test(
        {
          request_id: 0,
          type: 'store',
          options: {
            collection: table,
            data: conflict_batch,
            conflict: 'update',
            missing: 'error',
          },
        },
        (err, res) => {
          assert.notStrictEqual(err, null);
          assert.strictEqual(err.message, "'options.missing' was 'error' and a document was missing from the database.");
          check_table_size(11, done);
        });
    });

  it('store error insert new', (done) => {
      utils.stream_test(
        {
          request_id: 0,
          type: 'store',
          options: {
            collection: table,
            data: [ new_row ],
            conflict: 'error',
            missing: 'insert',
          },
        },
        (err, res) => {
          assert.ifError(err);
          check_table_size(11, done);
        });
    });

  it('store error insert conflict', (done) => {
      utils.stream_test(
        {
          request_id: 0,
          type: 'store',
          options: {
            collection: table,
            data: [ conflict_row ],
            conflict: 'error',
            missing: 'insert',
          },
        },
        (err, res) => {
          assert.notStrictEqual(err, null);
          assert(/Duplicate primary key `id`/.test(err.message));
          check_table_size(10, done);
        });
    });

  it('store error insert batch new', (done) => {
      utils.stream_test(
        {
          request_id: 0,
          type: 'store',
          options: {
            collection: table,
            data: new_batch,
            conflict: 'error',
            missing: 'insert',
          },
        },
        (err, res) => {
          assert.ifError(err);
          check_table_size(11, done);
        });
    });

  it('store error insert batch conflict', (done) => {
      utils.stream_test(
        {
          request_id: 0,
          type: 'store',
          options: {
            collection: table,
            data: conflict_batch,
            conflict: 'error',
            missing: 'insert',
          },
        },
        (err, res) => {
          assert.notStrictEqual(err, null);
          assert(/Duplicate primary key `id`/.test(err.message));
          check_table_size(11, done);
        });
    });

  it('store error error new', (done) => {
      utils.stream_test(
        {
          request_id: 0,
          type: 'store',
          options: {
            collection: table,
            data: [ new_row ],
            conflict: 'error',
            missing: 'error',
          },
        },
        (err, res) => {
          assert.notStrictEqual(err, null);
          assert.strictEqual(err.message, "'options.missing' and 'options.conflict' cannot both be 'error'.");
          check_table_size(10, done);
        });
    });

  it('store error error conflict', (done) => {
      utils.stream_test(
        {
          request_id: 0,
          type: 'store',
          options: {
            collection: table,
            data: [ conflict_row ],
            conflict: 'error',
            missing: 'error',
          },
        },
        (err, res) => {
          assert.notStrictEqual(err, null);
          assert.strictEqual(err.message, "'options.missing' and 'options.conflict' cannot both be 'error'.");
          check_table_size(10, done);
        });
    });

  it('store error error batch new', (done) => {
      utils.stream_test(
        {
          request_id: 0,
          type: 'store',
          options: {
            collection: table,
            data: new_batch,
            conflict: 'error',
            missing: 'error',
          },
        },
        (err, res) => {
          assert.notStrictEqual(err, null);
          assert.strictEqual(err.message, "'options.missing' and 'options.conflict' cannot both be 'error'.");
          check_table_size(10, done);
        });
    });

  it('store error error batch conflict', (done) => {
      utils.stream_test(
        {
          request_id: 0,
          type: 'store',
          options: {
            collection: table,
            data: conflict_batch,
            conflict: 'error',
            missing: 'error',
          },
        },
        (err, res) => {
          assert.notStrictEqual(err, null);
          assert.strictEqual(err.message, "'options.missing' and 'options.conflict' cannot both be 'error'.");
          check_table_size(10, done);
        });
    });

  it('remove single new', (done) => {
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
          check_table_size(10, done);
        });
    });

  it('remove single conflict', (done) => {
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
          check_table_size(9, done);
        });
    });

  it('remove single batch new', (done) => {
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
          check_table_size(10, done);
        });
    });

  it('remove single batch conflict', (done) => {
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
          check_table_size(8, done);
        });
    });
};
