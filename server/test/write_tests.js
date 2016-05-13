'use strict';

const utils = require('./utils');

const assert = require('assert');
const crypto = require('crypto');

// Before each test, ids [0, 4) will be present in the collection
const original_data = [
  { id: 0, old_field: [ ] },
  { id: 1, old_field: [ ] },
  { id: 2, old_field: [ ] },
  { id: 3, old_field: [ ] },
];

const new_id = [ 4 ];
const conflict_id = [ 3 ];
const new_ids = [ 4, 5, 6 ];
const conflict_ids = [ 2, 3, 4 ];

// TODO: verify through reql that rows have been inserted/removed
const all_tests = (collection) => {
  const new_row_from_id = (id) => ({ id, new_field: 'a' });
  const merged_row_from_id = (id) => {
    if (id >= 4) { return new_row_from_id(id); }
    return { id, new_field: 'a', old_field: [ ] };
  };

  const make_request = (type, ids) => ({
    request_id: crypto.randomBytes(4).readUInt32BE(),
    type: type,
    options: {
      collection,
      data: ids.map(new_row_from_id),
    },
  });

  const check_collection = (expected, done) => {
    utils.table(collection).orderBy({ index: 'id' }).coerceTo('array')
     .run(utils.rdb_conn()).then((res) => {
       assert.strictEqual(JSON.stringify(res), JSON.stringify(expected));
       done();
     }).catch((err) => done(err));
  };

  const combine_sort_data = (old_data, new_data, on_new, on_conflict) => {
    const map = new Map();
    old_data.forEach((row) => map.set(row.id, row));
    new_data.forEach((row) => {
      if (map.has(row.id)) {
        on_conflict(row, map);
      } else {
        on_new(row, map);
      }
    });
    return Array.from(map.values()).sort((a, b) => a.id - b.id);
  };

  const union_sort_data = (old_data, new_data) =>
    combine_sort_data(old_data, new_data,
      (row, map) => map.set(row.id, row), (row, map) => map.set(row.id, row));

  const replace_sort_data = (old_data, new_data) =>
    combine_sort_data(old_data, new_data,
      () => null, (row, map) => map.set(row.id, row));

  beforeEach('Clear collection', (done) => utils.clear_collection(collection, done));
  beforeEach('Populate collection', (done) => utils.populate_collection(collection, original_data, done));
  beforeEach('Authenticate', (done) => utils.horizon_default_auth(done));

  describe('Store', () => {
    const test_case = (ids, done) => {
      utils.stream_test(make_request('store', ids), (err, res) => {
        assert.ifError(err);
        assert.deepStrictEqual(res, ids);
        const new_data = ids.map(new_row_from_id);
        check_collection(union_sort_data(original_data, new_data), done);
      });
    };

    it('new', (done) => test_case(new_id, done));
    it('conflict', (done) => test_case(conflict_id, done));
    it('batch new', (done) => test_case(new_ids, done));
    it('batch conflict', (done) => test_case(conflict_ids, done));
  });

  describe('Replace', () => {
    const test_case = (ids, should_succeed, done) => {
      utils.stream_test(make_request('replace', ids), (err, res) => {
        if (should_succeed) {
          assert.ifError(err);
          assert.deepStrictEqual(res, ids);
        } else {
          assert.notStrictEqual(err, null);
          assert.strictEqual(err.message, 'The document with id 4 was missing.');
          assert.deepStrictEqual(res, [ ]);
        }
        const new_data = ids.map(new_row_from_id);
        check_collection(replace_sort_data(original_data, new_data), done);
      });
    };

    it('new', (done) => test_case(new_id, false, done));
    it('conflict', (done) => test_case(conflict_id, true, done));
    it('batch new', (done) => test_case(new_ids, false, done));
    it('batch conflict', (done) => test_case(conflict_ids, false, done));
  });

  describe('Upsert', () => {
    const test_case = (ids, done) => {
      utils.stream_test(make_request('upsert', ids), (err, res) => {
        assert.ifError(err);
        assert.deepStrictEqual(res, ids);
        const new_data = ids.map(merged_row_from_id);
        check_collection(union_sort_data(original_data, new_data), done);
      });
    };

    it('new', (done) => test_case(new_id, done));
    it('conflict', (done) => test_case(conflict_id, done));
    it('batch new', (done) => test_case(new_ids, done));
    it('batch conflict', (done) => test_case(conflict_ids, done));
  });

  describe('Update', () => {
    const test_case = (ids, should_succeed, done) => {
      utils.stream_test(make_request('update', ids), (err, res) => {
        if (should_succeed) {
          assert.ifError(err);
          assert.deepStrictEqual(res, ids);
        } else {
          assert.notStrictEqual(err, null);
          assert.strictEqual(err.message, 'The document with id 4 was missing.');
          assert.deepStrictEqual(res, [ ]);
        }
        const new_data = ids.map(merged_row_from_id);
        check_collection(replace_sort_data(original_data, new_data), done);
      });
    };

    it('new', (done) => test_case(new_id, false, done));
    it('conflict', (done) => test_case(conflict_id, true, done));
    it('batch new', (done) => test_case(new_ids, false, done));
    it('batch conflict', (done) => test_case(conflict_ids, false, done));
  });

  describe('Insert', () => {
    const add_sort_data = (old_data, new_data) =>
      combine_sort_data(old_data, new_data,
        (row, map) => map.set(row.id, row), () => null);

    const test_case = (ids, should_succeed, done) => {
      utils.stream_test(make_request('insert', ids), (err, res) => {
        if (should_succeed) {
          assert.ifError(err);
          assert.deepStrictEqual(res, ids);
        } else {
          assert.notStrictEqual(err, null);
          utils.check_error(err, 'Duplicate primary key');
          assert.deepStrictEqual(res, [ ]);
        }
        const new_data = ids.map(new_row_from_id);
        check_collection(add_sort_data(original_data, new_data), done);
      });
    };

    it('new', (done) => test_case(new_id, true, done));
    it('conflict', (done) => test_case(conflict_id, false, done));
    it('batch new', (done) => test_case(new_ids, true, done));
    it('batch conflict', (done) => test_case(conflict_ids, false, done));
  });

  describe('Remove', () => {
    // `old_data` and `new_data` may overlap, but each cannot contain duplicates
    const remove_sort_data = (old_data, new_data) =>
      combine_sort_data(old_data, new_data,
        () => null,
        (row, map) => map.delete(row.id));

    const test_case = (ids, done) => {
      utils.stream_test(make_request('remove', ids), (err, res) => {
        assert.ifError(err);
        assert.deepStrictEqual(res, ids);
        const deleted_data = ids.map(new_row_from_id);
        check_collection(remove_sort_data(original_data, deleted_data), done);
      });
    };

    it('new', (done) => test_case(new_id, done));
    it('conflict', (done) => test_case(conflict_id, done));
    it('batch new', (done) => test_case(new_ids, done));
    it('batch conflict', (done) => test_case(conflict_ids, done));
  });
};

const suite = (collection) => describe('Write', () => all_tests(collection));

module.exports = { suite };
