'use strict';

const utils = require('./utils');
const horizon_writes = require('../src/endpoint/writes');

const assert = require('assert');
const crypto = require('crypto');

const hz_v = horizon_writes.version_field;
const invalidated_msg = horizon_writes.invalidated_msg;

// Before each test, ids [0, 4) will be present in the collection
const original_data = [
  { id: 0, old_field: [ ], [hz_v]: 0 },
  { id: 1, old_field: [ ], [hz_v]: 0 },
  { id: 2, old_field: [ ], [hz_v]: 0 },
  { id: 3, old_field: [ ], [hz_v]: 0 },
];

const new_id = [ 4 ];
const conflict_id = [ 3 ];
const new_ids = [ 4, 5, 6 ];
const conflict_ids = [ 2, 3, 4 ];

const without_version = (item) => {
  const res = Object.assign({ }, item);
  delete res[hz_v];
  return res;
};

const compare_write_response = (actual, expected) => {
  assert.deepStrictEqual(actual.map(without_version), expected);
};

const check_collection_data = (actual, expected) => {
  // TODO: make sure that versions increment properly
  assert.deepStrictEqual(actual.map(without_version),
                         expected.map(without_version));
};

// TODO: verify through reql that rows have been inserted/removed
const all_tests = (collection) => {
  const new_row_from_id = (id) => ({ id, new_field: 'a' });
  const merged_row_from_id = (id) => {
    if (id >= 4) { return new_row_from_id(id); }
    return { id, new_field: 'a', old_field: [ ] };
  };

  const make_request = (type, data, options) => ({
    request_id: crypto.randomBytes(4).readUInt32BE(),
    type,
    options: Object.assign({}, options || {}, { collection, data }),
  });

  const check_collection = (expected, done) => {
    utils.table(collection).orderBy({ index: 'id' }).coerceTo('array')
      .run(utils.rdb_conn()).then((res) => {
        check_collection_data(res, expected);
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

  describe('Basic writes', () => {
    beforeEach('Authenticate', (done) => utils.horizon_admin_auth(done));
    beforeEach('Populate collection', (done) => utils.populate_collection(collection, original_data, done));

    const request_from_ids = (type, ids) => make_request(type, ids.map(new_row_from_id));

    describe('Store', () => {
      const test_case = (ids, done) => {
        utils.stream_test(request_from_ids('store', ids), (err, res) => {
          const expected = ids.map((id) => ({ id }));
          assert.ifError(err);
          compare_write_response(res, expected);
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
      const test_case = (ids, done) => {
        utils.stream_test(request_from_ids('replace', ids), (err, res) => {
          const expected = ids.map((id) =>
            (id < original_data.length ? { id } : { error: 'The document was missing.' })
          );
          assert.ifError(err);
          compare_write_response(res, expected);
          const new_data = ids.map(new_row_from_id);
          check_collection(replace_sort_data(original_data, new_data), done);
        });
      };

      it('new', (done) => test_case(new_id, done));
      it('conflict', (done) => test_case(conflict_id, done));
      it('batch new', (done) => test_case(new_ids, done));
      it('batch conflict', (done) => test_case(conflict_ids, done));
    });

    describe('Upsert', () => {
      const test_case = (ids, done) => {
        utils.stream_test(request_from_ids('upsert', ids), (err, res) => {
          const expected = ids.map((id) => ({ id }));
          assert.ifError(err);
          compare_write_response(res, expected);
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
      const test_case = (ids, done) => {
        utils.stream_test(request_from_ids('update', ids), (err, res) => {
          const expected = ids.map((id) =>
            (id < original_data.length ? { id } : { error: 'The document was missing.' })
          );
          assert.ifError(err);
          compare_write_response(res, expected);
          const new_data = ids.map(merged_row_from_id);
          check_collection(replace_sort_data(original_data, new_data), done);
        });
      };

      it('new', (done) => test_case(new_id, done));
      it('conflict', (done) => test_case(conflict_id, done));
      it('batch new', (done) => test_case(new_ids, done));
      it('batch conflict', (done) => test_case(conflict_ids, done));
    });

    describe('Insert', () => {
      const add_sort_data = (old_data, new_data) =>
        combine_sort_data(old_data, new_data,
          (row, map) => map.set(row.id, row), () => null);

      const test_case = (ids, done) => {
        utils.stream_test(request_from_ids('insert', ids), (err, res) => {
          const expected = ids.map((id) =>
            (id >= original_data.length ? { id } : { error: 'The document already exists.' })
          );

          assert.ifError(err);
          compare_write_response(res, expected);
          const new_data = ids.map(new_row_from_id);
          check_collection(add_sort_data(original_data, new_data), done);
        });
      };

      it('new', (done) => test_case(new_id, done));
      it('conflict', (done) => test_case(conflict_id, done));
      it('batch new', (done) => test_case(new_ids, done));
      it('batch conflict', (done) => test_case(conflict_ids, done));
    });

    describe('Remove', () => {
      // `old_data` and `new_data` may overlap, but each cannot contain duplicates
      const remove_sort_data = (old_data, new_data) =>
        combine_sort_data(old_data, new_data,
          () => null,
          (row, map) => map.delete(row.id));

      const test_case = (ids, done) => {
        utils.stream_test(request_from_ids('remove', ids), (err, res) => {
          const expected = ids.map((id) => ({ id }));
          assert.ifError(err);
          compare_write_response(res, expected);
          const deleted_data = ids.map(new_row_from_id);
          check_collection(remove_sort_data(original_data, deleted_data), done);
        });
      };

      it('new', (done) => test_case(new_id, done));
      it('conflict', (done) => test_case(conflict_id, done));
      it('batch new', (done) => test_case(new_ids, done));
      it('batch conflict', (done) => test_case(conflict_ids, done));
    });
  });

  describe('Versioned', () => {
    beforeEach('Authenticate', (done) => utils.horizon_admin_auth(done));

    const test_data = [ { id: 'versioned', [hz_v]: 11, foo: 'bar' } ];
    beforeEach('Populate collection', (done) => utils.populate_collection(collection, test_data, done));

    describe('Store', () => {
      const request = (row) => make_request('store', [ row ]);

      it('correct version', (done) => {
        utils.stream_test(request({ id: 'versioned', value: 1, [hz_v]: 11 }), (err, res) => {
          assert.ifError(err);
          const expected = [ { id: 'versioned', [hz_v]: 12 } ];
          assert.deepStrictEqual(res, expected);
          check_collection([ { id: 'versioned', [hz_v]: 12, value: 1 } ], done);
        });
      });

      it('incorrect version', (done) => {
        utils.stream_test(request({ id: 'versioned', value: 2, [hz_v]: 5 }), (err, res) => {
          assert.ifError(err);
          const expected = [ { error: invalidated_msg } ];
          assert.deepStrictEqual(res, expected);
          check_collection(test_data, done);
        });
      });
    });

    describe('Replace', () => {
      const request = (row) => make_request('replace', [ row ]);

      it('correct version', (done) => {
        utils.stream_test(request({ id: 'versioned', value: 1, [hz_v]: 11 }), (err, res) => {
          assert.ifError(err);
          const expected = [ { id: 'versioned', [hz_v]: 12 } ];
          assert.deepStrictEqual(res, expected);
          check_collection([ { id: 'versioned', [hz_v]: 12, value: 1 } ], done);
        });
      });

      it('incorrect version', (done) => {
        utils.stream_test(request({ id: 'versioned', value: 2, [hz_v]: 5 }), (err, res) => {
          assert.ifError(err);
          const expected = [ { error: invalidated_msg } ];
          assert.deepStrictEqual(res, expected);
          check_collection(test_data, done);
        });
      });
    });

    describe('Upsert', () => {
      const request = (row) => make_request('upsert', [ row ]);

      it('correct version', (done) => {
        utils.stream_test(request({ id: 'versioned', value: 1, [hz_v]: 11 }), (err, res) => {
          assert.ifError(err);
          const expected = [ { id: 'versioned', [hz_v]: 12 } ];
          assert.deepStrictEqual(res, expected);
          check_collection([ { id: 'versioned', [hz_v]: 12, value: 1, foo: 'bar' } ], done);
        });
      });

      it('incorrect version', (done) => {
        utils.stream_test(request({ id: 'versioned', value: 2, [hz_v]: 5 }), (err, res) => {
          assert.ifError(err);
          const expected = [ { error: invalidated_msg } ];
          assert.deepStrictEqual(res, expected);
          check_collection(test_data, done);
        });
      });
    });

    describe('Update', () => {
      const request = (row) => make_request('update', [ row ]);

      it('correct version', (done) => {
        utils.stream_test(request({ id: 'versioned', value: 1, [hz_v]: 11 }), (err, res) => {
          assert.ifError(err);
          const expected = [ { id: 'versioned', [hz_v]: 12 } ];
          assert.deepStrictEqual(res, expected);
          check_collection([ { id: 'versioned', [hz_v]: 12, value: 1, foo: 'bar' } ], done);
        });
      });

      it('incorrect version', (done) => {
        utils.stream_test(request({ id: 'versioned', value: 2, [hz_v]: 5 }), (err, res) => {
          assert.ifError(err);
          const expected = [ { error: invalidated_msg } ];
          assert.deepStrictEqual(res, expected);
          check_collection(test_data, done);
        });
      });
    });

    describe('Remove', () => {
      const request = (row) => make_request('remove', [ row ]);

      it('correct version', (done) => {
        utils.stream_test(request({ id: 'versioned', value: 1, [hz_v]: 11 }), (err, res) => {
          assert.ifError(err);
          const expected = [ { id: 'versioned', [hz_v]: 11 } ];
          assert.deepStrictEqual(res, expected);
          check_collection([ ], done);
        });
      });

      it('incorrect version', (done) => {
        utils.stream_test(request({ id: 'versioned', value: 2, [hz_v]: 5 }), (err, res) => {
          assert.ifError(err);
          const expected = [ { error: invalidated_msg } ];
          assert.deepStrictEqual(res, expected);
          check_collection(test_data, done);
        });
      });
    });
  });

  describe('Versionless', () => {
    beforeEach('Authenticate', (done) => utils.horizon_admin_auth(done));

    const test_data = [ { id: 'versionless', foo: 'bar' } ];
    beforeEach('Populate collection', (done) => utils.populate_collection(collection, test_data, done));

    describe('Store', () => {
      const request = (row) => make_request('store', [ row ]);

      it('unspecified version', (done) => {
        utils.stream_test(request({ id: 'versionless', value: 3 }), (err, res) => {
          assert.ifError(err);
          const expected = [ { id: 'versionless', [hz_v]: 0 } ];
          assert.deepStrictEqual(res, expected);
          check_collection([ { id: 'versionless', [hz_v]: 0, value: 3 } ], done);
        });
      });

      it('specified version', (done) => {
        utils.stream_test(request({ id: 'versionless', value: 4, [hz_v]: 5 }), (err, res) => {
          assert.ifError(err);
          const expected = [ { error: invalidated_msg } ];
          assert.deepStrictEqual(res, expected);
          check_collection(test_data, done);
        });
      });
    });

    describe('Replace', () => {
      const request = (row) => make_request('replace', [ row ]);

      it('unspecified version', (done) => {
        utils.stream_test(request({ id: 'versionless', value: 3 }), (err, res) => {
          assert.ifError(err);
          const expected = [ { id: 'versionless', [hz_v]: 0 } ];
          assert.deepStrictEqual(res, expected);
          check_collection([ { id: 'versionless', [hz_v]: 0, value: 3 } ], done);
        });
      });

      it('specified version', (done) => {
        utils.stream_test(request({ id: 'versionless', value: 4, [hz_v]: 5 }), (err, res) => {
          assert.ifError(err);
          const expected = [ { error: invalidated_msg } ];
          assert.deepStrictEqual(res, expected);
          check_collection(test_data, done);
        });
      });
    });

    describe('Upsert', () => {
      const request = (row) => make_request('upsert', [ row ]);

      it('unspecified version', (done) => {
        utils.stream_test(request({ id: 'versionless', value: 3 }), (err, res) => {
          assert.ifError(err);
          const expected = [ { id: 'versionless', [hz_v]: 0 } ];
          assert.deepStrictEqual(res, expected);
          check_collection([ { id: 'versionless', [hz_v]: 0, value: 3, foo: 'bar' } ], done);
        });
      });

      it('specified version', (done) => {
        utils.stream_test(request({ id: 'versionless', value: 4, [hz_v]: 5 }), (err, res) => {
          assert.ifError(err);
          const expected = [ { error: invalidated_msg } ];
          assert.deepStrictEqual(res, expected);
          check_collection(test_data, done);
        });
      });
    });

    describe('Update', () => {
      const request = (row) => make_request('update', [ row ]);

      it('unspecified version', (done) => {
        utils.stream_test(request({ id: 'versionless', value: 3 }), (err, res) => {
          assert.ifError(err);
          const expected = [ { id: 'versionless', [hz_v]: 0 } ];
          assert.deepStrictEqual(res, expected);
          check_collection([ { id: 'versionless', [hz_v]: 0, value: 3, foo: 'bar' } ], done);
        });
      });

      it('specified version', (done) => {
        utils.stream_test(request({ id: 'versionless', value: 4, [hz_v]: 5 }), (err, res) => {
          assert.ifError(err);
          const expected = [ { error: invalidated_msg } ];
          assert.deepStrictEqual(res, expected);
          check_collection(test_data, done);
        });
      });
    });

    describe('Remove', () => {
      const request = (row) => make_request('remove', [ row ]);

      it('unspecified version', (done) => {
        utils.stream_test(request({ id: 'versionless', value: 3 }), (err, res) => {
          assert.ifError(err);
          const expected = [ { id: 'versionless' } ];
          assert.deepStrictEqual(res, expected);
          check_collection([ ], done);
        });
      });

      it('specified version', (done) => {
        utils.stream_test(request({ id: 'versionless', value: 4, [hz_v]: 5 }), (err, res) => {
          assert.ifError(err);
          const expected = [ { error: invalidated_msg } ];
          assert.deepStrictEqual(res, expected);
          check_collection(test_data, done);
        });
      });
    });
  });

  // To guarantee multiple retries of a write, we combine a batch of writes
  // for the same row (unspecified versions) with a validator.  This way, only one
  // write will make it through each loop, although it is undefined in which order
  // the writes occur.
  describe('Retry', () => {
    beforeEach('Authenticate', (done) => utils.horizon_default_auth(done));

    // Set a catch-all rule for the 'default' group so we can have a validator
    before('Set rules', (done) => utils.set_group({
      id: 'default',
      rules: {
        dummy: {
          template: 'any()',
          validator: '() => true',
        },
      },
    }, done));

    const writes = [
      { id: 0, a: 1 },
      { id: 0, b: 2 },
      { id: 0, c: 3 },
    ];

    const by_version = (a, b) => a[hz_v] - b[hz_v];
    const check_and_get_latest_write = (res) => {
      const latest_index = res.findIndex((x) => x[hz_v] === 2);
      assert(latest_index !== -1);
      res.sort(by_version);
      assert.deepStrictEqual(res, [ { id: 0, [hz_v]: 0 },
                                    { id: 0, [hz_v]: 1 },
                                    { id: 0, [hz_v]: 2 } ]);
      return writes[latest_index];
    };

    // For some tests, we expect exactly one write to succeed and the others
    // to fail.  Which write succeeds is not guaranteed to be deterministic,
    // so we return the successful write data.
    const check_one_successful_write = (res, error) => {
      const success_index = res.findIndex((x) => x.error === undefined);
      assert(success_index !== -1);
      for (let i = 0; i < res.length; ++i) {
        if (i === success_index) {
          assert.deepStrictEqual(res[i], { id: 0, [hz_v]: 0 });
        } else {
          assert.deepStrictEqual(res[i], { error });
        }
      }
      return writes[success_index];
    };

    describe('Existing Row', () => {
      const test_data = [ { id: 0, value: 0 } ];
      beforeEach('Populate collection', (done) => utils.populate_collection(collection, test_data, done));

      it('Store', (done) => {
        utils.stream_test(make_request('store', writes), (err, res) => {
          assert.ifError(err);
          const latest_write = check_and_get_latest_write(res);
          check_collection([ Object.assign({ [hz_v]: 2 }, latest_write) ], done);
        });
      });

      it('Replace', (done) => {
        utils.stream_test(make_request('replace', writes), (err, res) => {
          assert.ifError(err);
          const latest_write = check_and_get_latest_write(res);
          check_collection([ Object.assign({ [hz_v]: 2 }, latest_write) ], done);
        });
      });

      it('Upsert', (done) => {
        utils.stream_test(make_request('upsert', writes), (err, res) => {
          assert.ifError(err);
          check_and_get_latest_write(res);
          check_collection([ { id: 0, value: 0, a: 1, b: 2, c: 3, [hz_v]: 2 } ], done);
        });
      });

      it('Update', (done) => {
        utils.stream_test(make_request('update', writes), (err, res) => {
          assert.ifError(err);
          check_and_get_latest_write(res);
          check_collection([ { id: 0, value: 0, a: 1, b: 2, c: 3, [hz_v]: 2 } ], done);
        });
      });

      it('Remove', (done) => {
        utils.stream_test(make_request('remove', writes), (err, res) => {
          assert.ifError(err);
          assert.deepStrictEqual(res.map((x) => x[hz_v]).sort(), [ undefined, undefined, undefined ]);
          assert.deepStrictEqual(res.map((x) => x.id), [ 0, 0, 0 ]);
          check_collection([ ], done);
        });
      });
    });

    describe('New Row', () => {
      it('Insert', (done) => {
        utils.stream_test(make_request('insert', writes), (err, res) => {
          assert.ifError(err);
          const success_write = check_one_successful_write(res, 'The document already exists.');
          check_collection([ Object.assign({ [hz_v]: 0 }, success_write) ], done);
        });
      });

      it('Store', (done) => {
        utils.stream_test(make_request('store', writes), (err, res) => {
          assert.ifError(err);
          const latest_write = check_and_get_latest_write(res);
          check_collection([ Object.assign({ [hz_v]: 2 }, latest_write) ], done);
        });
      });

      it('Upsert', (done) => {
        utils.stream_test(make_request('upsert', writes), (err, res) => {
          assert.ifError(err);
          assert.deepStrictEqual(res.map((x) => x[hz_v]).sort(), [ 0, 1, 2 ]);
          assert.deepStrictEqual(res.map((x) => x.id), [ 0, 0, 0 ]);
          check_collection([ { id: 0, a: 1, b: 2, c: 3, [hz_v]: 2 } ], done);
        });
      });
    });


    // Because all the writes are to the same document, only one can succeed
    // per iteration with the database.  In order to test timeouts, we use a
    // timeout of zero, so the other rows should immediately error.
    describe('Zero Timeout', () => {
      const timeout = { timeout: 0 };
      const test_data = [ { id: 0, value: 0 } ];
      beforeEach('Populate collection', (done) => utils.populate_collection(collection, test_data, done));

      it('Store', (done) => {
        utils.stream_test(make_request('store', writes, timeout), (err, res) => {
          assert.ifError(err);
          const success_write = check_one_successful_write(res, 'Operation timed out.');
          check_collection([ Object.assign({ [hz_v]: 0 }, success_write) ], done);
        });
      });

      it('Replace', (done) => {
        utils.stream_test(make_request('replace', writes, timeout), (err, res) => {
          assert.ifError(err);
          const success_write = check_one_successful_write(res, 'Operation timed out.');
          check_collection([ Object.assign({ [hz_v]: 0 }, success_write) ], done);
        });
      });

      it('Upsert', (done) => {
        utils.stream_test(make_request('upsert', writes, timeout), (err, res) => {
          assert.ifError(err);
          const success_write = check_one_successful_write(res, 'Operation timed out.');
          check_collection([ Object.assign({ [hz_v]: 0 }, test_data[0], success_write) ], done);
        });
      });

      it('Update', (done) => {
        utils.stream_test(make_request('update', writes, timeout), (err, res) => {
          assert.ifError(err);
          const success_write = check_one_successful_write(res, 'Operation timed out.');
          check_collection([ Object.assign({ [hz_v]: 0 }, test_data[0], success_write) ], done);
        });
      });
    });
  });
};

const suite = (collection) => describe('Write', () => all_tests(collection));

module.exports = { suite };
