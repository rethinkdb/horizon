'use strict';

const utils = require('./utils');
const pluginUtils = require('@horizon/plugin-utils');

const assert = require('assert');
const crypto = require('crypto');

const hzv = pluginUtils.writes.versionField;
const invalidatedMsg = pluginUtils.writes.invalidatedMsg;

// Before each test, ids [0, 4) will be present in the collection
const originalData = [
  {id: 0, oldField: [], [hzv]: 0},
  {id: 1, oldField: [], [hzv]: 0},
  {id: 2, oldField: [], [hzv]: 0},
  {id: 3, oldField: [], [hzv]: 0},
];

const newId = [4];
const conflictId = [3];
const newIds = [4, 5, 6];
const conflictIds = [2, 3, 4];

const withoutVersion = (item) => {
  const res = Object.assign({}, item);
  delete res[hzv];
  return res;
};

const compareWriteResponse = (actual, expected) => {
  assert.deepStrictEqual(actual.map(withoutVersion), expected);
};

const checkCollectionData = (actual, expected) => {
  // TODO: make sure that versions increment properly
  assert.deepStrictEqual(actual.map(withoutVersion),
                         expected.map(withoutVersion));
};

// TODO: verify through reql that rows have been inserted/removed
const allTests = (collection) => {
  const newRowFromId = (id) => ({id, newField: 'a'});
  const mergedRowFromId = (id) => {
    if (id >= 4) { return newRowFromId(id); }
    return {id, newField: 'a', oldField: []};
  };

  const makeRequest = (type, data, options) => ({
    requestId: crypto.randomBytes(4).readUInt32BE(),
    options: Object.assign({}, options || {}, {collection: [collection], [type]: data}),
  });

  const checkCollection = (expected, done) => {
    utils.table(collection).orderBy({index: 'id'}).coerceTo('array')
      .run(utils.rdbConn()).then((res) => {
        checkCollectionData(res, expected);
        done();
      }).catch((err) => done(err));
  };

  const combineSortData = (oldData, newData, onNew, onConflict) => {
    const map = new Map();
    oldData.forEach((row) => map.set(row.id, row));
    newData.forEach((row) => {
      if (map.has(row.id)) {
        onConflict(row, map);
      } else {
        onNew(row, map);
      }
    });
    return Array.from(map.values()).sort((a, b) => a.id - b.id);
  };

  const unionSortData = (oldData, newData) =>
    combineSortData(oldData, newData,
      (row, map) => map.set(row.id, row), (row, map) => map.set(row.id, row));

  const replaceSortData = (oldData, newData) =>
    combineSortData(oldData, newData,
      () => null, (row, map) => map.set(row.id, row));

  beforeEach('Clear collection', () => utils.clearCollection(collection));

  describe('Basic writes', () => {
    beforeEach('Authenticate', (done) => utils.horizonTokenAuth('admin', done));
    beforeEach('Populate collection', () => utils.populateCollection(collection, originalData));

    const requestFromIds = (type, ids) => makeRequest(type, ids.map(newRowFromId));

    describe('Store', () => {
      const testCase = (ids, done) => {
        utils.streamTest(requestFromIds('store', ids), (err, res) => {
          const expected = ids.map((id) => ({id}));
          assert.ifError(err);
          compareWriteResponse(res, expected);
          const newData = ids.map(newRowFromId);
          checkCollection(unionSortData(originalData, newData), done);
        });
      };

      it('new', (done) => testCase(newId, done));
      it('conflict', (done) => testCase(conflictId, done));
      it('batch new', (done) => testCase(newIds, done));
      it('batch conflict', (done) => testCase(conflictIds, done));
    });

    describe('Replace', () => {
      const testCase = (ids, done) => {
        utils.streamTest(requestFromIds('replace', ids), (err, res) => {
          const expected = ids.map((id) =>
            (id < originalData.length ? {id} : {error: 'The document was missing.'})
          );
          assert.ifError(err);
          compareWriteResponse(res, expected);
          const newData = ids.map(newRowFromId);
          checkCollection(replaceSortData(originalData, newData), done);
        });
      };

      it('new', (done) => testCase(newId, done));
      it('conflict', (done) => testCase(conflictId, done));
      it('batch new', (done) => testCase(newIds, done));
      it('batch conflict', (done) => testCase(conflictIds, done));
    });

    describe('Upsert', () => {
      const testCase = (ids, done) => {
        utils.streamTest(requestFromIds('upsert', ids), (err, res) => {
          const expected = ids.map((id) => ({id}));
          assert.ifError(err);
          compareWriteResponse(res, expected);
          const newData = ids.map(mergedRowFromId);
          checkCollection(unionSortData(originalData, newData), done);
        });
      };

      it('new', (done) => testCase(newId, done));
      it('conflict', (done) => testCase(conflictId, done));
      it('batch new', (done) => testCase(newIds, done));
      it('batch conflict', (done) => testCase(conflictIds, done));
    });

    describe('Update', () => {
      const testCase = (ids, done) => {
        utils.streamTest(requestFromIds('update', ids), (err, res) => {
          const expected = ids.map((id) =>
            (id < originalData.length ? {id} : {error: 'The document was missing.'})
          );
          assert.ifError(err);
          compareWriteResponse(res, expected);
          const newData = ids.map(mergedRowFromId);
          checkCollection(replaceSortData(originalData, newData), done);
        });
      };

      it('new', (done) => testCase(newId, done));
      it('conflict', (done) => testCase(conflictId, done));
      it('batch new', (done) => testCase(newIds, done));
      it('batch conflict', (done) => testCase(conflictIds, done));
    });

    describe('Insert', () => {
      const addSortData = (oldData, newData) =>
        combineSortData(oldData, newData,
          (row, map) => map.set(row.id, row), () => null);

      const testCase = (ids, done) => {
        utils.streamTest(requestFromIds('insert', ids), (err, res) => {
          const expected = ids.map((id) =>
            (id >= originalData.length ? {id} : {error: 'The document already exists.'})
          );

          assert.ifError(err);
          compareWriteResponse(res, expected);
          const newData = ids.map(newRowFromId);
          checkCollection(addSortData(originalData, newData), done);
        });
      };

      it('new', (done) => testCase(newId, done));
      it('conflict', (done) => testCase(conflictId, done));
      it('batch new', (done) => testCase(newIds, done));
      it('batch conflict', (done) => testCase(conflictIds, done));
    });

    describe('Remove', () => {
      // `oldData` and `newData` may overlap, but each cannot contain duplicates
      const removeSortData = (oldData, newData) =>
        combineSortData(oldData, newData,
          () => null,
          (row, map) => map.delete(row.id));

      const testCase = (ids, done) => {
        utils.streamTest(requestFromIds('remove', ids), (err, res) => {
          const expected = ids.map((id) => ({id}));
          assert.ifError(err);
          compareWriteResponse(res, expected);
          const deletedData = ids.map(newRowFromId);
          checkCollection(removeSortData(originalData, deletedData), done);
        });
      };

      it('new', (done) => testCase(newId, done));
      it('conflict', (done) => testCase(conflictId, done));
      it('batch new', (done) => testCase(newIds, done));
      it('batch conflict', (done) => testCase(conflictIds, done));
    });
  });

  describe('Versioned', () => {
    beforeEach('Authenticate', (done) => utils.horizonTokenAuth('admin', done));

    const testData = [{id: 'versioned', [hzv]: 11, foo: 'bar'}];
    beforeEach('Populate collection', () => utils.populateCollection(collection, testData));

    describe('Store', () => {
      const request = (row) => makeRequest('store', [row]);

      it('correct version', (done) => {
        utils.streamTest(request({id: 'versioned', value: 1, [hzv]: 11}), (err, res) => {
          assert.ifError(err);
          const expected = [{id: 'versioned', [hzv]: 12}];
          assert.deepStrictEqual(res, expected);
          checkCollection([{id: 'versioned', [hzv]: 12, value: 1}], done);
        });
      });

      it('incorrect version', (done) => {
        utils.streamTest(request({id: 'versioned', value: 2, [hzv]: 5}), (err, res) => {
          assert.ifError(err);
          const expected = [{error: invalidatedMsg}];
          assert.deepStrictEqual(res, expected);
          checkCollection(testData, done);
        });
      });
    });

    describe('Replace', () => {
      const request = (row) => makeRequest('replace', [row]);

      it('correct version', (done) => {
        utils.streamTest(request({id: 'versioned', value: 1, [hzv]: 11}), (err, res) => {
          assert.ifError(err);
          const expected = [{id: 'versioned', [hzv]: 12}];
          assert.deepStrictEqual(res, expected);
          checkCollection([{id: 'versioned', [hzv]: 12, value: 1}], done);
        });
      });

      it('incorrect version', (done) => {
        utils.streamTest(request({id: 'versioned', value: 2, [hzv]: 5}), (err, res) => {
          assert.ifError(err);
          const expected = [{error: invalidatedMsg}];
          assert.deepStrictEqual(res, expected);
          checkCollection(testData, done);
        });
      });
    });

    describe('Upsert', () => {
      const request = (row) => makeRequest('upsert', [row]);

      it('correct version', (done) => {
        utils.streamTest(request({id: 'versioned', value: 1, [hzv]: 11}), (err, res) => {
          assert.ifError(err);
          const expected = [{id: 'versioned', [hzv]: 12}];
          assert.deepStrictEqual(res, expected);
          checkCollection([{id: 'versioned', [hzv]: 12, value: 1, foo: 'bar'}], done);
        });
      });

      it('incorrect version', (done) => {
        utils.streamTest(request({id: 'versioned', value: 2, [hzv]: 5}), (err, res) => {
          assert.ifError(err);
          const expected = [{error: invalidatedMsg}];
          assert.deepStrictEqual(res, expected);
          checkCollection(testData, done);
        });
      });
    });

    describe('Update', () => {
      const request = (row) => makeRequest('update', [row]);

      it('correct version', (done) => {
        utils.streamTest(request({id: 'versioned', value: 1, [hzv]: 11}), (err, res) => {
          assert.ifError(err);
          const expected = [{id: 'versioned', [hzv]: 12}];
          assert.deepStrictEqual(res, expected);
          checkCollection([{id: 'versioned', [hzv]: 12, value: 1, foo: 'bar'}], done);
        });
      });

      it('incorrect version', (done) => {
        utils.streamTest(request({id: 'versioned', value: 2, [hzv]: 5}), (err, res) => {
          assert.ifError(err);
          const expected = [{error: invalidatedMsg}];
          assert.deepStrictEqual(res, expected);
          checkCollection(testData, done);
        });
      });
    });

    describe('Remove', () => {
      const request = (row) => makeRequest('remove', [row]);

      it('correct version', (done) => {
        utils.streamTest(request({id: 'versioned', value: 1, [hzv]: 11}), (err, res) => {
          assert.ifError(err);
          const expected = [{id: 'versioned', [hzv]: 11}];
          assert.deepStrictEqual(res, expected);
          checkCollection([], done);
        });
      });

      it('incorrect version', (done) => {
        utils.streamTest(request({id: 'versioned', value: 2, [hzv]: 5}), (err, res) => {
          assert.ifError(err);
          const expected = [{error: invalidatedMsg}];
          assert.deepStrictEqual(res, expected);
          checkCollection(testData, done);
        });
      });
    });
  });

  describe('Versionless', () => {
    beforeEach('Authenticate', (done) => utils.horizonTokenAuth('admin', done));

    const testData = [{id: 'versionless', foo: 'bar'}];
    beforeEach('Populate collection', () => utils.populateCollection(collection, testData));

    describe('Store', () => {
      const request = (row) => makeRequest('store', [row]);

      it('unspecified version', (done) => {
        utils.streamTest(request({id: 'versionless', value: 3}), (err, res) => {
          assert.ifError(err);
          const expected = [{id: 'versionless', [hzv]: 0}];
          assert.deepStrictEqual(res, expected);
          checkCollection([{id: 'versionless', [hzv]: 0, value: 3}], done);
        });
      });

      it('specified version', (done) => {
        utils.streamTest(request({id: 'versionless', value: 4, [hzv]: 5}), (err, res) => {
          assert.ifError(err);
          const expected = [{error: invalidatedMsg}];
          assert.deepStrictEqual(res, expected);
          checkCollection(testData, done);
        });
      });
    });

    describe('Replace', () => {
      const request = (row) => makeRequest('replace', [row]);

      it('unspecified version', (done) => {
        utils.streamTest(request({id: 'versionless', value: 3}), (err, res) => {
          assert.ifError(err);
          const expected = [{id: 'versionless', [hzv]: 0}];
          assert.deepStrictEqual(res, expected);
          checkCollection([{id: 'versionless', [hzv]: 0, value: 3}], done);
        });
      });

      it('specified version', (done) => {
        utils.streamTest(request({id: 'versionless', value: 4, [hzv]: 5}), (err, res) => {
          assert.ifError(err);
          const expected = [{error: invalidatedMsg}];
          assert.deepStrictEqual(res, expected);
          checkCollection(testData, done);
        });
      });
    });

    describe('Upsert', () => {
      const request = (row) => makeRequest('upsert', [row]);

      it('unspecified version', (done) => {
        utils.streamTest(request({id: 'versionless', value: 3}), (err, res) => {
          assert.ifError(err);
          const expected = [{id: 'versionless', [hzv]: 0}];
          assert.deepStrictEqual(res, expected);
          checkCollection([{id: 'versionless', [hzv]: 0, value: 3, foo: 'bar'}], done);
        });
      });

      it('specified version', (done) => {
        utils.streamTest(request({id: 'versionless', value: 4, [hzv]: 5}), (err, res) => {
          assert.ifError(err);
          const expected = [{error: invalidatedMsg}];
          assert.deepStrictEqual(res, expected);
          checkCollection(testData, done);
        });
      });
    });

    describe('Update', () => {
      const request = (row) => makeRequest('update', [row]);

      it('unspecified version', (done) => {
        utils.streamTest(request({id: 'versionless', value: 3}), (err, res) => {
          assert.ifError(err);
          const expected = [{id: 'versionless', [hzv]: 0}];
          assert.deepStrictEqual(res, expected);
          checkCollection([{id: 'versionless', [hzv]: 0, value: 3, foo: 'bar'}], done);
        });
      });

      it('specified version', (done) => {
        utils.streamTest(request({id: 'versionless', value: 4, [hzv]: 5}), (err, res) => {
          assert.ifError(err);
          const expected = [{error: invalidatedMsg}];
          assert.deepStrictEqual(res, expected);
          checkCollection(testData, done);
        });
      });
    });

    describe('Remove', () => {
      const request = (row) => makeRequest('remove', [row]);

      it('unspecified version', (done) => {
        utils.streamTest(request({id: 'versionless', value: 3}), (err, res) => {
          assert.ifError(err);
          const expected = [{id: 'versionless'}];
          assert.deepStrictEqual(res, expected);
          checkCollection([], done);
        });
      });

      it('specified version', (done) => {
        utils.streamTest(request({id: 'versionless', value: 4, [hzv]: 5}), (err, res) => {
          assert.ifError(err);
          const expected = [{error: invalidatedMsg}];
          assert.deepStrictEqual(res, expected);
          checkCollection(testData, done);
        });
      });
    });
  });

  // To guarantee multiple retries of a write, we combine a batch of writes
  // for the same row (unspecified versions) with a validator.  This way, only one
  // write will make it through each loop, although it is undefined in which order
  // the writes occur.
  describe('Retry', () => {
    beforeEach('Authenticate', (done) => utils.horizonUnauthenticatedAuth(done));

    // Set a catch-all rule for the 'default' group so we can have a validator
    before('Set rules', (done) => utils.setGroup({
      id: 'default',
      rules: {
        dummy: {
          template: 'any()',
          validator: '() => true',
        },
      },
    }, done));

    const writes = [
      {id: 0, a: 1},
      {id: 0, b: 2},
      {id: 0, c: 3},
    ];

    const byVersion = (a, b) => a[hzv] - b[hzv];
    const checkAndGetLatestWrite = (res) => {
      const latestIndex = res.findIndex((x) => x[hzv] === 2);
      assert(latestIndex !== -1);
      res.sort(byVersion);
      assert.deepStrictEqual(res, [{id: 0, [hzv]: 0},
                                    {id: 0, [hzv]: 1},
                                    {id: 0, [hzv]: 2}]);
      return writes[latestIndex];
    };

    // For some tests, we expect exactly one write to succeed and the others
    // to fail.  Which write succeeds is not guaranteed to be deterministic,
    // so we return the successful write data.
    const checkOneSuccessfulWrite = (res, error) => {
      const successIndex = res.findIndex((x) => x.error === undefined);
      assert(successIndex !== -1);
      for (let i = 0; i < res.length; ++i) {
        if (i === successIndex) {
          assert.deepStrictEqual(res[i], {id: 0, [hzv]: 0});
        } else {
          assert.deepStrictEqual(res[i], {error});
        }
      }
      return writes[successIndex];
    };

    describe('Existing Row', () => {
      const testData = [{id: 0, value: 0}];
      beforeEach('Populate collection', () => utils.populateCollection(collection, testData));

      it('Store', (done) => {
        utils.streamTest(makeRequest('store', writes), (err, res) => {
          assert.ifError(err);
          const latestWrite = checkAndGetLatestWrite(res);
          checkCollection([Object.assign({[hzv]: 2}, latestWrite)], done);
        });
      });

      it('Replace', (done) => {
        utils.streamTest(makeRequest('replace', writes), (err, res) => {
          assert.ifError(err);
          const latestWrite = checkAndGetLatestWrite(res);
          checkCollection([Object.assign({[hzv]: 2}, latestWrite)], done);
        });
      });

      it('Upsert', (done) => {
        utils.streamTest(makeRequest('upsert', writes), (err, res) => {
          assert.ifError(err);
          checkAndGetLatestWrite(res);
          checkCollection([{id: 0, value: 0, a: 1, b: 2, c: 3, [hzv]: 2}], done);
        });
      });

      it('Update', (done) => {
        utils.streamTest(makeRequest('update', writes), (err, res) => {
          assert.ifError(err);
          checkAndGetLatestWrite(res);
          checkCollection([{id: 0, value: 0, a: 1, b: 2, c: 3, [hzv]: 2}], done);
        });
      });

      it('Remove', (done) => {
        utils.streamTest(makeRequest('remove', writes), (err, res) => {
          assert.ifError(err);
          assert.deepStrictEqual(res.map((x) => x[hzv]).sort(), [undefined, undefined, undefined]);
          assert.deepStrictEqual(res.map((x) => x.id), [0, 0, 0]);
          checkCollection([], done);
        });
      });
    });

    describe('New Row', () => {
      it('Insert', (done) => {
        utils.streamTest(makeRequest('insert', writes), (err, res) => {
          assert.ifError(err);
          const successWrite = checkOneSuccessfulWrite(res, 'The document already exists.');
          checkCollection([Object.assign({[hzv]: 0}, successWrite)], done);
        });
      });

      it('Store', (done) => {
        utils.streamTest(makeRequest('store', writes), (err, res) => {
          assert.ifError(err);
          const latestWrite = checkAndGetLatestWrite(res);
          checkCollection([Object.assign({[hzv]: 2}, latestWrite)], done);
        });
      });

      it('Upsert', (done) => {
        utils.streamTest(makeRequest('upsert', writes), (err, res) => {
          assert.ifError(err);
          assert.deepStrictEqual(res.map((x) => x[hzv]).sort(), [0, 1, 2]);
          assert.deepStrictEqual(res.map((x) => x.id), [0, 0, 0]);
          checkCollection([{id: 0, a: 1, b: 2, c: 3, [hzv]: 2}], done);
        });
      });
    });


    // Because all the writes are to the same document, only one can succeed
    // per iteration with the database.  In order to test timeouts, we use a
    // timeout of zero, so the other rows should immediately error.
    describe('Zero Timeout', () => {
      const timeout = {timeout: [0]};
      const testData = [{id: 0, value: 0}];
      beforeEach('Populate collection', () => utils.populateCollection(collection, testData));

      it('Store', (done) => {
        utils.streamTest(makeRequest('store', writes, timeout), (err, res) => {
          assert.ifError(err);
          const successWrite = checkOneSuccessfulWrite(res, 'Operation timed out.');
          checkCollection([Object.assign({[hzv]: 0}, successWrite)], done);
        });
      });

      it('Replace', (done) => {
        utils.streamTest(makeRequest('replace', writes, timeout), (err, res) => {
          assert.ifError(err);
          const successWrite = checkOneSuccessfulWrite(res, 'Operation timed out.');
          checkCollection([Object.assign({[hzv]: 0}, successWrite)], done);
        });
      });

      it('Upsert', (done) => {
        utils.streamTest(makeRequest('upsert', writes, timeout), (err, res) => {
          assert.ifError(err);
          const successWrite = checkOneSuccessfulWrite(res, 'Operation timed out.');
          checkCollection([Object.assign({[hzv]: 0}, testData[0], successWrite)], done);
        });
      });

      it('Update', (done) => {
        utils.streamTest(makeRequest('update', writes, timeout), (err, res) => {
          assert.ifError(err);
          const successWrite = checkOneSuccessfulWrite(res, 'Operation timed out.');
          checkCollection([Object.assign({[hzv]: 0}, testData[0], successWrite)], done);
        });
      });
    });
  });
};

const suite = (collection) => describe('Write', () => allTests(collection));

module.exports = {suite};
