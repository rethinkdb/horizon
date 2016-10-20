'use strict';

const utils = require('./utils');

const assert = require('assert');

const r = require('rethinkdb');

const userId = 3;
const userRow = {id: userId, groups: ['default']};

// Permit all rows
const permittedValidator = `
(userRow) => {
  if (!userRow) { throw new Error('Validator was not passed a user row.'); }
  return true;
}
`;

// Forbid all rows
const forbiddenValidator = `
(userRow) => {
  if (!userRow) { throw new Error('Validator was not passed a user row.'); }
  return false;
}
`;

// Permit a row when the user's id is the last digit of the row's id
const userPermittedValidator = `
(userRow, a, b) => {
  if (!userRow) { throw new Error('Validator was not passed a user row.'); }
  const value = (a && a.id) || (b && b.id);
  return userRow.id === (value % 10);
}
`;

const allTests = (collection) => {
  describe('Validation', () => {
    const tableData = [];
    for (let i = 0; i < 10; ++i) {
      tableData.push({id: i});
    }

    beforeEach('Clear test table', () =>
      r.table(collection).delete().run(utils.rdbConn()));
    beforeEach('Populate test table', () =>
      r.table(collection).insert(tableData).run(utils.rdbConn()));
    before('Create user row', () =>
      r.table('users').insert(userRow).run(utils.rdbConn()));

    beforeEach('Authenticate', (done) => utils.horizonTokenAuth(userId, done));

    const run = (rawOptions, validator) => new Promise((resolve, reject) => {
      // Write group row into database
      r.table('hz_groups').insert(
          {id: 'default', rules: {test: {template: 'any()', validator}}},
          {conflict: 'replace'}).run(utils.rdbConn()).then(() => {
        // TODO: this seems a bit racy - no guarantee that horizon will be up-to-date
        // Construct request and send on websocket
        const options = Object.assign({collection: [collection]}, rawOptions);
        utils.streamTest({requestId: 1, options: options}, (err, res) => {
          if (err) {
            err.results = res;
            reject(err);
          } else {
            resolve(res);
          }
        });
      }).catch(reject);
    });

    describe('fetch', () => {
      it('permitted', () =>
        run({order: [['id'], 'ascending'], fetch: []}, permittedValidator).then((res) => {
          assert.deepStrictEqual(res, tableData);
        }));

      it('half-permitted', () =>
        run({order: [['id'], 'ascending'], above: [{id: 3}, 'closed'], fetch: []},
            userPermittedValidator).then(() => {
              assert(false, 'Read should not have been permitted.');
            }).catch((err) => {
              assert.strictEqual(err.message, 'Operation not permitted.');
              // Check that we got the permitted row or nothing (race condition)
              if (err.results.length !== 0) {
                assert.deepStrictEqual(err.results, [{id: 3}]);
              }
            }));

      it('forbidden', () =>
        run({fetch: []}, forbiddenValidator).then(() => {
          assert(false, 'Read should not have been permitted.');
        }).catch((err) => {
          assert.strictEqual(err.message, 'Operation not permitted.');
          assert.strictEqual(err.results.length, 0);
        }));
    });

    describe('watch', () => {
      it('permitted with subsequent permitted change', () => {
        // TODO: can't use run, need to issue a write during the subscription
      });

      it('permitted with subsequent forbidden change', () => {
        // TODO: can't use run, need to issue a write during the subscription
      });

      it('half-permitted', () =>
        run({order: [['id'], 'ascending'], above: [{id: 3}, 'closed'], limit: [3], watch: []},
            userPermittedValidator).then(() => {
              assert(false, 'Read should not have been permitted.');
            }).catch((err) => {
              assert.strictEqual(err.message, 'Operation not permitted.');
              assert.strictEqual(err.results.length, 1);
              assert.deepStrictEqual(err.results[0].id, 3);
            }));

      it('forbidden', () =>
        run({watch: []}, forbiddenValidator).then(() => {
          assert(false, 'Read should not have been permitted.');
        }).catch((err) => {
          assert.strictEqual(err.message, 'Operation not permitted.');
          assert.strictEqual(err.results.size, 0);
        }));
    });

    describe('insert', () => {
      it('permitted', () =>
        run({insert: [{id: 11}]}, permittedValidator).then((res) => {
          assert.strictEqual(res.length, 1);
          assert.strictEqual(res[0].error, undefined);
          assert.strictEqual(res[0].id, 11);
          return r.table(collection).get(11).eq(null)
            .branch(r.error('write did not go through'), null).run(utils.rdbConn());
        }));

      it('permitted based on context', () =>
        run({insert: [{id: 13}]}, userPermittedValidator).then((res) => {
          assert.strictEqual(res.length, 1);
          assert.strictEqual(res[0].error, undefined);
          assert.strictEqual(res[0].id, 13);
          return r.table(collection).get(13).eq(null)
            .branch(r.error('write did not go through'), null).run(utils.rdbConn());
        }));

      it('forbidden', () =>
        run({insert: [{id: 11}]}, forbiddenValidator).then((res) => {
          assert.deepStrictEqual(res, [{error: 'Operation not permitted.'}]);
          return r.table(collection).get(11).ne(null)
            .branch(r.error('write went through'), null).run(utils.rdbConn());
        }));

      it('forbidden based on context', () =>
        run({insert: [{id: 11}]}, userPermittedValidator).then((res) => {
          assert.deepStrictEqual(res, [{error: 'Operation not permitted.'}]);
          return r.table(collection).get(11).ne(null)
            .branch(r.error('write went through'), null).run(utils.rdbConn());
        }));
    });

    describe('store', () => {
      it('permitted', () =>
        run({store: [{id: 11}]}, permittedValidator).then((res) => {
          assert.strictEqual(res.length, 1);
          assert.strictEqual(res[0].error, undefined);
          assert.strictEqual(res[0].id, 11);
          return r.table(collection).get(11).eq(null)
            .branch(r.error('write did not go through'), null).run(utils.rdbConn());
        }));

      it('permitted based on context', () =>
        run({store: [{id: 13}]}, userPermittedValidator).then((res) => {
          assert.strictEqual(res.length, 1);
          assert.strictEqual(res[0].error, undefined);
          assert.strictEqual(res[0].id, 13);
          return r.table(collection).get(13).eq(null)
            .branch(r.error('write did not go through'), null).run(utils.rdbConn());
        }));

      it('forbidden', () =>
        run({store: [{id: 11}]}, forbiddenValidator).then((res) => {
          assert.deepStrictEqual(res, [{error: 'Operation not permitted.'}]);
          return r.table(collection).get(11).ne(null)
            .branch(r.error('write went through'), null).run(utils.rdbConn());
        }));

      it('forbidden based on context', () =>
        run({store: [{id: 11}]}, userPermittedValidator).then((res) => {
          assert.deepStrictEqual(res, [{error: 'Operation not permitted.'}]);
          return r.table(collection).get(11).ne(null)
            .branch(r.error('write went through'), null).run(utils.rdbConn());
        }));
    });

    describe('upsert', () => {
      it('permitted', () =>
        run({upsert: [{id: 11}]}, permittedValidator).then((res) => {
          assert.strictEqual(res.length, 1);
          assert.strictEqual(res[0].error, undefined);
          assert.strictEqual(res[0].id, 11);
          return r.table(collection).get(11).eq(null)
            .branch(r.error('write did not go through'), null).run(utils.rdbConn());
        }));

      it('permitted based on context', () =>
        run({upsert: [{id: 13}]}, userPermittedValidator).then((res) => {
          assert.strictEqual(res.length, 1);
          assert.strictEqual(res[0].error, undefined);
          assert.strictEqual(res[0].id, 13);
          return r.table(collection).get(13).eq(null)
            .branch(r.error('write did not go through'), null).run(utils.rdbConn());
        }));

      it('forbidden', () =>
        run({upsert: [{id: 11}]}, forbiddenValidator).then((res) => {
          assert.deepStrictEqual(res, [{error: 'Operation not permitted.'}]);
          return r.table(collection).get(11).ne(null)
            .branch(r.error('write went through'), null).run(utils.rdbConn());
        }));

      it('forbidden based on context', () =>
        run({upsert: [{id: 11}]}, userPermittedValidator).then((res) => {
          assert.deepStrictEqual(res, [{error: 'Operation not permitted.'}]);
          return r.table(collection).get(11).ne(null)
            .branch(r.error('write went through'), null).run(utils.rdbConn());
        }));
    });

    describe('update', () => {
      it('permitted', () =>
        run({update: [{id: 1, value: 5}]}, permittedValidator).then((res) => {
          assert.strictEqual(res.length, 1);
          assert.strictEqual(res[0].error, undefined);
          assert.strictEqual(res[0].id, 1);
          return r.table(collection).get(1).hasFields('value').not()
            .branch(r.error('write did not go through'), null).run(utils.rdbConn());
        }));

      it('permitted based on context', () =>
        run({update: [{id: 3, value: 5}]}, userPermittedValidator).then((res) => {
          assert.strictEqual(res.length, 1);
          assert.strictEqual(res[0].error, undefined);
          assert.strictEqual(res[0].id, 3);
          return r.table(collection).get(3).hasFields('value').not()
            .branch(r.error('write did not go through'), null).run(utils.rdbConn());
        }));

      it('forbidden', () =>
        run({update: [{id: 1, value: 5}]}, forbiddenValidator).then((res) => {
          assert.deepStrictEqual(res, [{error: 'Operation not permitted.'}]);
          return r.table(collection).get(1).hasFields('value')
            .branch(r.error('write went through'), null).run(utils.rdbConn());
        }));

      it('forbidden based on context', () =>
        run({update: [{id: 1, value: 5}]}, userPermittedValidator).then((res) => {
          assert.deepStrictEqual(res, [{error: 'Operation not permitted.'}]);
          return r.table(collection).get(1).hasFields('value')
            .branch(r.error('write went through'), null).run(utils.rdbConn());
        }));
    });

    describe('replace', () => {
      it('permitted', () =>
        run({replace: [{id: 1, value: 5}]}, permittedValidator).then((res) => {
          assert.strictEqual(res.length, 1);
          assert.strictEqual(res[0].error, undefined);
          assert.strictEqual(res[0].id, 1);
          return r.table(collection).get(1).hasFields('value').not()
            .branch(r.error('write did not go through'), null).run(utils.rdbConn());
        }));

      it('permitted based on context', () =>
        run({replace: [{id: 3, value: 5}]}, userPermittedValidator).then((res) => {
          assert.strictEqual(res.length, 1);
          assert.strictEqual(res[0].error, undefined);
          assert.strictEqual(res[0].id, 3);
          return r.table(collection).get(3).hasFields('value').not()
            .branch(r.error('write did not go through'), null).run(utils.rdbConn());
        }));

      it('forbidden', () =>
        run({replace: [{id: 1, value: 5}]}, forbiddenValidator).then((res) => {
          assert.deepStrictEqual(res, [{error: 'Operation not permitted.'}]);
          return r.table(collection).get(1).hasFields('value')
            .branch(r.error('write went through'), null).run(utils.rdbConn());
        }));

      it('forbidden based on context', () =>
        run({replace: [{id: 1, value: 5}]}, userPermittedValidator).then((res) => {
          assert.deepStrictEqual(res, [{error: 'Operation not permitted.'}]);
          return r.table(collection).get(1).hasFields('value')
            .branch(r.error('write went through'), null).run(utils.rdbConn());
        }));
    });

    describe('remove', () => {
      it('permitted', () =>
        run({remove: [{id: 1}]}, permittedValidator).then((res) => {
          assert.strictEqual(res.length, 1);
          assert.strictEqual(res[0].error, undefined);
          assert.strictEqual(res[0].id, 1);
          return r.table(collection).get(1).ne(null)
            .branch(r.error('write did not go through'), null).run(utils.rdbConn());
        }));

      it('permitted based on context', () =>
        run({remove: [{id: 3}]}, userPermittedValidator).then((res) => {
          assert.strictEqual(res.length, 1);
          assert.strictEqual(res[0].error, undefined);
          assert.strictEqual(res[0].id, 3);
          return r.table(collection).get(3).ne(null)
            .branch(r.error('write did not go through'), null).run(utils.rdbConn());
        }));

      it('forbidden', () =>
        run({remove: [{id: 1}]}, forbiddenValidator).then((res) => {
          assert.deepStrictEqual(res, [{error: 'Operation not permitted.'}]);
          return r.table(collection).get(1).eq(null)
            .branch(r.error('write went through'), null).run(utils.rdbConn());
        }));

      it('forbidden based on context', () =>
        run({remove: [{id: 1}]}, userPermittedValidator).then((res) => {
          assert.deepStrictEqual(res, [{error: 'Operation not permitted.'}]);
          return r.table(collection).get(1).eq(null)
            .branch(r.error('write went through'), null).run(utils.rdbConn());
        }));
    });
  });
};

const suite = (collection) => describe('Permissions', () => allTests(collection));

module.exports = {suite};
