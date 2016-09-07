'use strict';

const utils = require('./utils');

const assert = require('assert');

const r = require('rethinkdb');

const user_id = 3;
const context = { user: { id: user_id } };

// Permit all rows
const permitted_validator = `
(context) => {
  if (!context) { throw new Error('no context'); }
  return true;
}
`;

// Forbid all rows
const forbidden_validator = `
(context) => {
  if (!context) { throw new Error('no context'); }
  return false;
}
`;

// Permit a row when the user's id is the last digit of the row's id
const user_permitted_validator = `
(context, a, b) => {
  if (!context) { throw new Error('no context'); }
  const value = (a && a.user.id) || (b && b.user.id);
  return context.id === (value % 10);
}
`;

const all_tests = (collection) => {
  describe('Validation', () => {
    const metadata = {
      collection: () => ({
        table: r.table(collection),
        get_matching_index: () => ({name: 'id', fields: ['id']}),
      }),
      connection: () => utils.rdb_conn(),
    };

    const table_data = [];
    for (let i = 0; i < 10; ++i) {
      table_data.push({id: i});
    }

    beforeEach('Clear test table', () =>
      r.table(collection).delete().run(utils.rdb_conn()));
    beforeEach('Populate test table', () =>
      r.table(collection).insert(table_data).run(utils.rdb_conn()));
    before('Create user row', () =>
      r.table('users').insert(context).run(utils.rdb_conn()));

    const run = (options, validator) => new Promise((resolve, reject) => {
        // Write group row into database
      r.table('hz_groups').insert(
          {id: 'default', rules: r.literal({test: {template: 'any()', validator}})},
          {conflict: 'update'}).run(utils.rdb_conn());

        // Construct query and send on websocket
      utils.stream_test({request_id: 1, options}, (err, res) => {
        if (err) {
          reject(err);
        } else {
          resolve(res);
        }
      });
    });

    describe('query', () => {
      it('permitted', () =>
        run({order: [['id'], 'ascending'], query: []}, permitted_validator).then((res) => {
          assert.deepStrictEqual(res, table_data);
        }));

      it('half-permitted', () =>
        run({order: [['id'], 'ascending'], above: [{id: 3}, 'closed'], query: []},
            user_permitted_validator).then(() => {
              assert(false, 'Read should not have been permitted.');
            }).catch((err) => {
              assert.strictEqual(err.message, 'Operation not permitted.');
          // Check that we got the permitted row or nothing (race condition)
              if (err.results.length !== 0) {
                assert.deepStrictEqual(err.results, [{id: 3}]);
              }
            }));

      it('forbidden', () =>
        run({query: []}, forbidden_validator).then(() => {
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
        run({order: [['id'], 'ascending'], above: [{id: 3}, 'closed'], watch: []},
            user_permitted_validator).then(() => {
              assert(false, 'Read should not have been permitted.');
            }).catch((err) => {
              assert.strictEqual(err.message, 'Operation not permitted.');
          // Check that we got the permitted row or nothing (race condition)
              if (err.results.length !== 0) {
                assert.deepStrictEqual(err.results, [{id: 3}]);
              }
            }));

      it('forbidden', () =>
        run({watch: []}, forbidden_validator).then(() => {
          assert(false, 'Read should not have been permitted.');
        }).catch((err) => {
          assert.strictEqual(err.message, 'Operation not permitted.');
          assert.strictEqual(err.results.length, 0);
        }));
    });

    describe('insert', () => {
      it('permitted', () =>
        run({insert: [{id: 11}]}, permitted_validator).then((res) => {
          assert.strictEqual(res.length, 1);
          assert.strictEqual(res[0].id, 11);
          return r.table(collection).get(11).eq(null)
            .branch(r.error('write did not go through'), null).run(utils.rdb_conn());
        }));

      it('permitted based on context', () =>
        run({insert: [{id: 13}]}, user_permitted_validator).then((res) => {
          assert.strictEqual(res.length, 1);
          assert.strictEqual(res[0].id, 13);
          return r.table(collection).get(13).eq(null)
            .branch(r.error('write did not go through'), null).run(utils.rdb_conn());
        }));

      it('forbidden', () =>
        run({insert: [{id: 11}]}, forbidden_validator).then((res) => {
          assert.deepStrictEqual(res, [{error: 'Operation not permitted.'}]);
          return r.table(collection).get(11).ne(null)
            .branch(r.error('write went through'), null).run(utils.rdb_conn());
        }));

      it('forbidden based on context', () =>
        run({insert: [{id: 11}]}, user_permitted_validator).then((res) => {
          assert.deepStrictEqual(res, [{error: 'Operation not permitted.'}]);
          return r.table(collection).get(11).ne(null)
            .branch(r.error('write went through'), null).run(utils.rdb_conn());
        }));
    });

    describe('store', () => {
      it('permitted', () =>
        run({store: [{id: 11}]}, permitted_validator).then((res) => {
          assert.strictEqual(res.length, 1);
          assert.strictEqual(res[0].id, 11);
          return r.table(collection).get(11).eq(null)
            .branch(r.error('write did not go through'), null).run(utils.rdb_conn());
        }));

      it('permitted based on context', () =>
        run({store: [{id: 13}]}, user_permitted_validator).then((res) => {
          assert.strictEqual(res.length, 1);
          assert.strictEqual(res[0].id, 13);
          return r.table(collection).get(13).eq(null)
            .branch(r.error('write did not go through'), null).run(utils.rdb_conn());
        }));

      it('forbidden', () =>
        run({store: [{id: 11}]}, forbidden_validator).then((res) => {
          assert.deepStrictEqual(res, [{error: 'Operation not permitted.'}]);
          return r.table(collection).get(11).ne(null)
            .branch(r.error('write went through'), null).run(utils.rdb_conn());
        }));

      it('forbidden based on context', () =>
        run({store: [{id: 11}]}, user_permitted_validator).then((res) => {
          assert.deepStrictEqual(res, [{error: 'Operation not permitted.'}]);
          return r.table(collection).get(11).ne(null)
            .branch(r.error('write went through'), null).run(utils.rdb_conn());
        }));
    });

    describe('upsert', () => {
      it('permitted', () =>
        run({upsert: [{id: 11}]}, permitted_validator).then((res) => {
          assert.strictEqual(res.length, 1);
          assert.strictEqual(res[0].id, 11);
          return r.table(collection).get(11).eq(null)
            .branch(r.error('write did not go through'), null).run(utils.rdb_conn());
        }));

      it('permitted based on context', () =>
        run({upsert: [{id: 13}]}, user_permitted_validator).then((res) => {
          assert.strictEqual(res.length, 1);
          assert.strictEqual(res[0].id, 13);
          return r.table(collection).get(13).eq(null)
            .branch(r.error('write did not go through'), null).run(utils.rdb_conn());
        }));

      it('forbidden', () =>
        run({upsert: [{id: 11}]}, forbidden_validator).then((res) => {
          assert.deepStrictEqual(res, [{error: 'Operation not permitted.'}]);
          return r.table(collection).get(11).ne(null)
            .branch(r.error('write went through'), null).run(utils.rdb_conn());
        }));

      it('forbidden based on context', () =>
        run({upsert: [{id: 11}]}, user_permitted_validator).then((res) => {
          assert.deepStrictEqual(res, [{error: 'Operation not permitted.'}]);
          return r.table(collection).get(11).ne(null)
            .branch(r.error('write went through'), null).run(utils.rdb_conn());
        }));
    });

    describe('update', () => {
      it('permitted', () =>
        run({update: [{id: 1, value: 5}]}, permitted_validator).then((res) => {
          assert.strictEqual(res.length, 1);
          assert.strictEqual(res[0].id, 1);
          return r.table(collection).get(1).hasFields('value').not()
            .branch(r.error('write did not go through'), null).run(utils.rdb_conn());
        }));

      it('permitted based on context', () =>
        run({update: [{id: 3, value: 5}]}, user_permitted_validator).then((res) => {
          assert.strictEqual(res.length, 1);
          assert.strictEqual(res[0].id, 3);
          return r.table(collection).get(3).hasFields('value').not()
            .branch(r.error('write did not go through'), null).run(utils.rdb_conn());
        }));

      it('forbidden', () =>
        run({update: [{id: 1, value: 5}]}, forbidden_validator).then((res) => {
          assert.deepStrictEqual(res, [{error: 'Operation not permitted.'}]);
          return r.table(collection).get(1).hasFields('value')
            .branch(r.error('write went through'), null).run(utils.rdb_conn());
        }));

      it('forbidden based on context', () =>
        run({update: [{id: 1, value: 5}]}, user_permitted_validator).then((res) => {
          assert.deepStrictEqual(res, [{error: 'Operation not permitted.'}]);
          return r.table(collection).get(1).hasFields('value')
            .branch(r.error('write went through'), null).run(utils.rdb_conn());
        }));
    });

    describe('replace', () => {
      it('permitted', () =>
        run({replace: [{id: 1, value: 5}]}, permitted_validator).then((res) => {
          assert.strictEqual(res.length, 1);
          assert.strictEqual(res[0].id, 1);
          return r.table(collection).get(1).hasFields('value').not()
            .branch(r.error('write did not go through'), null).run(utils.rdb_conn());
        }));

      it('permitted based on context', () =>
        run({replace: [{id: 3, value: 5}]}, user_permitted_validator).then((res) => {
          assert.strictEqual(res.length, 1);
          assert.strictEqual(res[0].id, 3);
          return r.table(collection).get(3).hasFields('value').not()
            .branch(r.error('write did not go through'), null).run(utils.rdb_conn());
        }));

      it('forbidden', () =>
        run({replace: [{id: 1, value: 5}]}, forbidden_validator).then((res) => {
          assert.deepStrictEqual(res, [{error: 'Operation not permitted.'}]);
          return r.table(collection).get(1).hasFields('value')
            .branch(r.error('write went through'), null).run(utils.rdb_conn());
        }));

      it('forbidden based on context', () =>
        run({replace: [{id: 1, value: 5}]}, user_permitted_validator).then((res) => {
          assert.deepStrictEqual(res, [{error: 'Operation not permitted.'}]);
          return r.table(collection).get(1).hasFields('value')
            .branch(r.error('write went through'), null).run(utils.rdb_conn());
        }));
    });

    describe('remove', () => {
      it('permitted', () =>
        run({remove: [{id: 1}]}, permitted_validator).then((res) => {
          assert.strictEqual(res.length, 1);
          assert.strictEqual(res[0].id, 1);
          return r.table(collection).get(1).ne(null)
            .branch(r.error('write did not go through'), null).run(utils.rdb_conn());
        }));

      it('permitted based on context', () =>
        run({remove: [{id: 3}]}, user_permitted_validator).then((res) => {
          assert.strictEqual(res.length, 1);
          assert.strictEqual(res[0].id, 3);
          return r.table(collection).get(3).ne(null)
            .branch(r.error('write did not go through'), null).run(utils.rdb_conn());
        }));

      it('forbidden', () =>
        run({remove: [{id: 1}]}, forbidden_validator).then((res) => {
          assert.deepStrictEqual(res, [{error: 'Operation not permitted.'}]);
          return r.table(collection).get(1).eq(null)
            .branch(r.error('write went through'), null).run(utils.rdb_conn());
        }));

      it('forbidden based on context', () =>
        run({remove: [{id: 1}]}, user_permitted_validator).then((res) => {
          assert.deepStrictEqual(res, [{error: 'Operation not permitted.'}]);
          return r.table(collection).get(1).eq(null)
            .branch(r.error('write went through'), null).run(utils.rdb_conn());
        }));
    });
  });
};

const suite = (collection) => describe('Permissions', () => all_tests(collection));

module.exports = {suite};
