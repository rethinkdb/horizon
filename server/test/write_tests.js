'use strict';

const utils = require('./utils');

const assert = require('assert');
const crypto = require('crypto');
const r = require('rethinkdb');

// Before each test, ids [0, 4) will be present in the table
const num_rows = 4;

const new_id = [ 4 ];
const conflict_id = [ 3 ];
const new_ids = [ 4, 5, 6 ];
const conflict_ids = [ 2, 3, 4 ];

// TODO: verify through reql that rows have been inserted/removed
const all_tests = (table) => {
  const make_request = (type, ids) => {
    return {
      request_id: crypto.randomBytes(4).readUInt32BE(),
        type: type,
        options: {
          collection: table,
          data: ids.map((id) => ({ id, new_field: 'a' })),
        },
      };
  }

  const check_table_size = (expected, done) => {
    r.table(table).count().run(utils.rdb_conn()).then((res) => {
      assert.strictEqual(res, expected);
      done();
    }).catch((err) => done(err));
  };

  beforeEach('Clear table', (done) => utils.clear_table(table, done));
  beforeEach('Populate table', (done) => utils.populate_table(table, num_rows, done));
  beforeEach('Authenticate', (done) => utils.fusion_default_auth(done));

  describe('Store', () => {
    it('new', (done) => {
      utils.stream_test(make_request('store', new_id), (err, res) => {
        assert.ifError(err);
        assert.deepStrictEqual(res, new_id);
        check_table_size(5, done);
      });
    });

    it('conflict', (done) => {
      utils.stream_test(make_request('store', conflict_id), (err, res) => {
        assert.ifError(err);
        assert.deepStrictEqual(res, conflict_id);
        check_table_size(4, done);
      });
    });

    it('batch new', (done) => {
      utils.stream_test(make_request('store', new_ids), (err, res) => {
        assert.ifError(err);
        assert.deepStrictEqual(res, new_ids);
        check_table_size(7, done);
      });
    });

    it('batch conflict', (done) => {
      utils.stream_test(make_request('store', conflict_ids), (err, res) => {
        assert.ifError(err);
        assert.deepStrictEqual(res, conflict_ids);
        check_table_size(5, done);
      });
    });
  });

  describe('Replace', () => {
    it('new', (done) => {
      utils.stream_test(make_request('replace', new_id), (err, res) => {
        assert.notStrictEqual(err, null);
        assert.strictEqual(err.message, `The document with id 4 was missing.`);
        assert.deepStrictEqual(res, [ ]);
        check_table_size(4, done);
      });
    });

    it('conflict', (done) => {
      utils.stream_test(make_request('replace', conflict_id), (err, res) => {
        assert.ifError(err);
        assert.deepStrictEqual(res, conflict_id);
        check_table_size(4, done);
      });
    });

    it('batch new', (done) => {
      utils.stream_test(make_request('replace', new_ids), (err, res) => {
        assert.notStrictEqual(err, null);
        assert.strictEqual(err.message, `The document with id 4 was missing.`);
        assert.deepStrictEqual(res, [ ]);
        check_table_size(4, done);
      });
    });

    it('batch conflict', (done) => {
      utils.stream_test(make_request('replace', conflict_ids), (err, res) => {
        assert.notStrictEqual(err, null);
        assert.strictEqual(err.message, `The document with id 4 was missing.`);
        assert.deepStrictEqual(res, [ ]);
        check_table_size(4, done);
      });
    });
  });

  describe('Upsert', () => {
    it('new', (done) => {
      utils.stream_test(make_request('upsert', new_id), (err, res) => {
        assert.ifError(err);
        assert.deepStrictEqual(res, new_id);
        check_table_size(5, done);
      });
    });

    it('conflict', (done) => {
      utils.stream_test(make_request('upsert', conflict_id), (err, res) => {
        assert.ifError(err);
        assert.deepStrictEqual(res, conflict_id);
        check_table_size(4, done);
      });
    });

    it('batch new', (done) => {
      utils.stream_test(make_request('upsert', new_ids), (err, res) => {
        assert.ifError(err);
        assert.deepStrictEqual(res, new_ids);
        check_table_size(7, done);
      });
    });

    it('batch conflict', (done) => {
      utils.stream_test(make_request('upsert', conflict_ids), (err, res) => {
        assert.ifError(err);
        assert.deepStrictEqual(res, conflict_ids);
        check_table_size(5, done);
      });
    });
  });

  describe('Update', () => {
    it('new', (done) => {
      utils.stream_test(make_request('update', new_id), (err, res) => {
        assert.notStrictEqual(err, null);
        assert.strictEqual(err.message, `The document with id 4 was missing.`);
        assert.deepStrictEqual(res, [ ]);
        check_table_size(4, done);
      });
    });

    it('conflict', (done) => {
      utils.stream_test(make_request('update', conflict_id), (err, res) => {
        assert.ifError(err);
        assert.deepStrictEqual(res, conflict_id);
        check_table_size(4, done);
      });
    });

    it('batch new', (done) => {
      utils.stream_test(make_request('update', new_ids), (err, res) => {
        assert.notStrictEqual(err, null);
        assert.strictEqual(err.message, `The document with id 4 was missing.`);
        assert.deepStrictEqual(res, [ ]);
        check_table_size(4, done);
      });
    });

    it('batch conflict', (done) => {
      utils.stream_test(make_request('update', conflict_ids), (err, res) => {
        assert.notStrictEqual(err, null);
        assert.strictEqual(err.message, `The document with id 4 was missing.`);
        assert.deepStrictEqual(res, [ ]);
        check_table_size(4, done);
      });
    });
  });

  describe('Insert', () => {
    it('new', (done) => {
      utils.stream_test(make_request('insert', new_id), (err, res) => {
        assert.ifError(err);
        assert.deepStrictEqual(res, new_id);
        check_table_size(5, done);
      });
    });

    it('conflict', (done) => {
      utils.stream_test(make_request('insert', conflict_id), (err, res) => {
        assert.notStrictEqual(err, null);
        utils.check_error(err, 'Duplicate primary key');
        assert.deepStrictEqual(res, [ ]);
        check_table_size(4, done);
      });
    });

    it('batch new', (done) => {
      utils.stream_test(make_request('insert', new_ids), (err, res) => {
        assert.ifError(err);
        assert.deepStrictEqual(res, new_ids);
        check_table_size(7, done);
      });
    });

    it('batch conflict', (done) => {
      utils.stream_test(make_request('insert', conflict_ids), (err, res) => {
        assert.notStrictEqual(err, null);
        utils.check_error(err, 'Duplicate primary key');
        assert.deepStrictEqual(res, [ ]);
        check_table_size(5, done);
      });
    });
  });

  describe('Remove', () => {
    it('new', (done) => {
      utils.stream_test(make_request('remove', new_id), (err, res) => {
        assert.ifError(err);
        assert.deepStrictEqual(res, new_id);
        check_table_size(4, done);
      });
    });

    it('conflict', (done) => {
      utils.stream_test(make_request('remove', conflict_id), (err, res) => {
        assert.ifError(err);
        assert.deepStrictEqual(res, conflict_id);
        check_table_size(3, done);
      });
    });

    it('batch new', (done) => {
      utils.stream_test(make_request('remove', new_ids), (err, res) => {
        assert.ifError(err);
        assert.deepStrictEqual(res, new_ids);
        check_table_size(4, done);
      });
    });

    it('batch conflict', (done) => {
      utils.stream_test(make_request('remove', conflict_ids), (err, res) => {
        assert.ifError(err);
        assert.deepStrictEqual(res, conflict_ids);
        check_table_size(2, done);
      });
    });
  });
};

const suite = (table) => describe('Write', () => all_tests(table));

module.exports = { suite };
