'use strict';

const hz_rule = require('../src/permissions/rule');
const hz_validator = require('../src/permissions/validator');
const query = require('../src/endpoint/query');
const subscribe = require('../src/endpoint/subscribe');
const insert = require('../src/endpoint/insert');
const store = require('../src/endpoint/store');
const update = require('../src/endpoint/update');
const upsert = require('../src/endpoint/upsert');
const replace = require('../src/endpoint/replace');
const remove = require('../src/endpoint/remove');
const utils = require('./utils');

const assert = require('assert');

const r = require('rethinkdb');

const Rule = hz_rule.Rule;
const Ruleset = hz_rule.Ruleset;
const Validator = hz_validator.Validator;

const make_request = (type, collection, options) => {
  if (collection !== null) {
    return { request_id: 5, type, options: Object.assign({ collection }, options) };
  } else {
    return { request_id: 5, type, options };
  }
};

const context = { id: 3, groups: [ 'admin', 'default', 'authenticated' ] };

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
  const value = (a && a.id) || (b && b.id);
  return context.id === (value % 10);
}
`;

const all_tests = (collection) => {
  describe('Template', () => {
    it('any', () => {
      const rule = new Rule('foo', { template: 'any()' });

      const tests = [ { },
                      { type: 'query', options: { collection: 'test' } },
                      { fake: 'bar' },
                      { options: { } },
                      { type: 'query', options: { fake: 'baz' } } ];

      for (const t of tests) {
        assert(rule.is_match(t, context));
        assert(rule.is_valid());
      }
    });

    it('any read', () => {
      const rule = new Rule('foo', { template: 'collection(any()).anyRead()' });
      assert(rule.is_valid());
      assert(!rule.is_match(make_request('fake', 'test', { }), context));
      assert(!rule.is_match(make_request('store', 'test', { }), context));
      assert(!rule.is_match(make_request('query', null, { }), context));
      assert(rule.is_match(make_request('query', 'fake', { }), context));
      assert(rule.is_match(make_request('query', 'fake', { find: { } }), context));
      assert(rule.is_match(make_request('query', 'test', { bar: 'baz' }), context));
      assert(rule.is_match(make_request('query', 'test', { find_all: [ { }, { } ] }), context));
      assert(!rule.is_match(make_request('subscribe', null, { }), context));
      assert(rule.is_match(make_request('subscribe', 'fake', { }), context));
      assert(rule.is_match(make_request('subscribe', 'fake', { find: { } }), context));
      assert(rule.is_match(make_request('subscribe', 'test', { bar: 'baz' }), context));
      assert(rule.is_match(make_request('subscribe', 'test', { find_all: [ { }, { } ] }), context));
    });

    it('any read with collection', () => {
      const rule = new Rule('foo', { template: 'collection("test").anyRead()' });
      assert(rule.is_valid());
      assert(!rule.is_match(make_request('query', 'fake', { }), context));
      assert(rule.is_match(make_request('query', 'test', { }), context));
      assert(rule.is_match(make_request('query', 'test', { }), context));
      assert(rule.is_match(make_request('query', 'test', { }), context));
      assert(rule.is_match(make_request('subscribe', 'test', { }), context));
      assert(rule.is_match(make_request('subscribe', 'test', { }), context));
      assert(rule.is_match(make_request('subscribe', 'test', { }), context));
      assert(rule.is_match(make_request('subscribe', 'test', { }), context));
    });

    it('any read with order', () => {
      // TODO: allow for any number of fields in order
      const rule = new Rule('foo', { template: 'collection("test").order(any(), any()).anyRead()' });
      assert(rule.is_valid());
      assert(!rule.is_match(make_request('query', 'fake', { order: [ 'foo', 'ascending' ] }), context));
      assert(!rule.is_match(make_request('query', 'test', { }), context));
      assert(!rule.is_match(make_request('query', 'test', { order: [ 'baz' ] }), context));
      assert(!rule.is_match(make_request('query', 'test', { order: [ 'baz', 'fake' ] }), context));
      assert(!rule.is_match(make_request('query', 'test', { order: [ [ 'fake' ] ] }), context));
      assert(rule.is_match(make_request('query', 'test', { order: [ [ 'foo' ], 'ascending' ] }), context));
      assert(rule.is_match(make_request('query', 'test', { order: [ [ 'bar' ], 'descending' ] }), context));
      assert(rule.is_match(make_request('query', 'test', { order: [ [ 'baz' ], 'fake' ] }), context));
      assert(rule.is_match(make_request('query', 'test', { find: { }, order: [ [ 'baz' ], 'fake' ] }), context));
      assert(rule.is_match(make_request('query', 'test', { find_all: [ { } ], order: [ [ 'baz' ], 'fake' ] }), context));
      assert(rule.is_match(make_request('query', 'test', { fake: 'baz', order: [ [ 'baz' ], 'fake' ] }), context));
    });

    it('any read with find', () => {
      const rule = new Rule('foo', { template: 'collection("test").find(any()).anyRead()' });
      assert(rule.is_valid());
      assert(!rule.is_match(make_request('query', 'fake', { find: { } }), context));
      assert(!rule.is_match(make_request('query', 'test', { }), context));
      assert(rule.is_match(make_request('query', 'test', { find: { } }), context));
      assert(rule.is_match(make_request('query', 'test', { find: { }, fake: 'baz' }), context));
    });

    it('any read with findAll', () => {
      // TODO: allow for any number of arguments in findAll
      const rule = new Rule('foo', { template: 'collection("test").findAll(any()).anyRead()' });
      assert(rule.is_valid());
      assert(!rule.is_match(make_request('query', 'fake', { find_all: { } }), context));
      assert(!rule.is_match(make_request('query', 'test', { }), context));
      assert(rule.is_match(make_request('query', 'test', { find_all: [ { } ] }), context));
      assert(rule.is_match(make_request('query', 'test', { find_all: [ { } ], fake: 'baz' }), context));
    });

    it('single key in findAll', () => {
      const rule = new Rule('foo', { template: 'collection("test").findAll({ owner: userId() }).fetch()' });
      assert(rule.is_valid());
      assert(!rule.is_match(make_request('query', 'test', { find_all: { } }), context));
      assert(!rule.is_match(make_request('query', 'test', { find_all: true }), context));
      assert(!rule.is_match(make_request('query', 'test', { find_all: [ ] }), context));
      assert(!rule.is_match(make_request('query', 'test', { find_all: [ { bar: 'baz' } ] }), context));
      assert(!rule.is_match(make_request('query', 'test', { find_all: [ { owner: (context.id + 1) } ] }), context));
      assert(!rule.is_match(make_request('query', 'test', { find_all: [ { owner: context.id, bar: 'baz' } ] }), context));
      assert(!rule.is_match(make_request('query', 'test', { find_all: [ { owner: context.id }, { other: context.id } ] }), context));
      assert(rule.is_match(make_request('query', 'test', { find_all: [ { owner: context.id } ] }), context));
    });

    it('multiple keys in findAll', () => {
      const rule = new Rule('foo', { template: 'collection("test").findAll({ owner: userId(), key: any() }).fetch()' });
      assert(rule.is_valid());
      assert(!rule.is_match(make_request('query', 'test', { find_all: { } }), context));
      assert(!rule.is_match(make_request('query', 'test', { find_all: true }), context));
      assert(!rule.is_match(make_request('query', 'test', { find_all: [ ] }), context));
      assert(!rule.is_match(make_request('query', 'test', { find_all: [ { bar: 'baz' } ] }), context));
      assert(!rule.is_match(make_request('query', 'test', { find_all: [ { owner: (context.id + 1) } ] }), context));
      assert(!rule.is_match(make_request('query', 'test', { find_all: [ { owner: context.id, bar: 'baz' } ] }), context));
      assert(rule.is_match(make_request('query', 'test', { find_all: [ { owner: context.id, key: 3 } ] }), context));
    });

    it('multiple items in findAll', () => {
      const rule = new Rule('foo', { template: 'collection("test").findAll({ a: userId() }, { b: userId() })' });
      assert(rule.is_valid());
      assert(!rule.is_match(make_request('query', 'test', { find_all: { } }), context));
      assert(!rule.is_match(make_request('query', 'test', { find_all: true }), context));
      assert(!rule.is_match(make_request('query', 'test', { find_all: [ ] }), context));
      assert(!rule.is_match(make_request('query', 'test', { find_all: [ { bar: 'baz' } ] }), context));
      assert(!rule.is_match(make_request('query', 'test', { find_all: [ { a: (context.id + 1) }, { b: context.id } ] }), context));
      assert(!rule.is_match(make_request('query', 'test', { find_all: [ { a: context.id, bar: 'baz' } ] }), context));
      assert(!rule.is_match(make_request('query', 'test', { find_all: [ { a: context.id, b: context.id } ] }), context));
      assert(!rule.is_match(make_request('query', 'test', { find_all: [ { a: context.id } ] }), context));
      assert(!rule.is_match(make_request('query', 'test', { find_all: [ { b: context.id } ] }), context));
      assert(!rule.is_match(make_request('query', 'test', { find_all: [ { a: context.id }, { b: context.id, bar: 'baz' } ] }), context));
      assert(rule.is_match(make_request('query', 'test', { find_all: [ { a: context.id }, { b: context.id } ] }), context));
    });

    it('collection fetch', () => {
      const rule = new Rule('foo', { template: 'collection("test").fetch()' });
      assert(rule.is_valid());
      assert(!rule.is_match(make_request('query', 'fake', { }), context));
      assert(!rule.is_match(make_request('query', 'test', { bar: 'baz' }), context));
      assert(!rule.is_match(make_request('query', 'test', { find: { id: 5 } }), context));
      assert(rule.is_match(make_request('query', 'test', { }), context));
    });

    it('collection watch', () => {
      const rule = new Rule('foo', { template: 'collection("test").watch()' });
      assert(rule.is_valid());
      assert(!rule.is_match(make_request('subscribe', 'fake', { }), context));
      assert(!rule.is_match(make_request('subscribe', 'test', { bar: 'baz' }), context));
      assert(!rule.is_match(make_request('subscribe', 'test', { find: { id: 5 } }), context));
      assert(rule.is_match(make_request('subscribe', 'test', { }), context));
    });

    for (const type of [ 'store', 'update', 'insert', 'upsert', 'replace', 'remove' ]) {
      it(`collection ${type}`, () => {
        const rule = new Rule('foo', { template: `collection("test").${type}(any())` });
        assert(rule.is_valid());
        assert(!rule.is_match(make_request(type, 'test', { }), context));
        assert(!rule.is_match(make_request(type, 'test', { data: { } }), context));
        assert(!rule.is_match(make_request(type, 'test', { data: [ ] }), context));
        assert(!rule.is_match(make_request(type, 'fake', { data: [ { } ] }), context));
        assert(!rule.is_match(make_request(type, 'test', { data: [ { } ], fake: 6 }), context));
        assert(rule.is_match(make_request(type, 'test', { data: [ { } ] }), context));
      });
      it(`collection ${type} batch`, () => {
        const rule = new Rule('foo', { template: `collection("test").${type}(anyArray(any()))` });
        assert(rule.is_valid());
        assert(!rule.is_match(make_request(type, 'test', { }), context));
        assert(!rule.is_match(make_request(type, 'test', { data: { } }), context));
        assert(!rule.is_match(make_request(type, 'test', { data: [ { } ], fake: 6 }), context));
        assert(!rule.is_match(make_request(type, 'fake', { data: [ { } ] }), context));
        assert(rule.is_match(make_request(type, 'test', { data: [ ] }), context));
        assert(rule.is_match(make_request(type, 'test', { data: [ { } ] }), context));
        assert(rule.is_match(make_request(type, 'test', { data: [ { }, { bar: 'baz' } ] }), context));
      });
    }

    it('any write', () => {
      const rule = new Rule('foo', { template: 'collection("test").anyWrite()' });
      assert(rule.is_valid());
      assert(!rule.is_match(make_request('fake', 'test', { }), context));
      assert(!rule.is_match(make_request('query', 'test', { }), context));
      assert(!rule.is_match(make_request('store', null, { }), context));

      for (const type of [ 'store', 'update', 'insert', 'upsert', 'replace', 'remove' ]) {
        assert(!rule.is_match(make_request(type, 'fake', { }), context));
        assert(rule.is_match(make_request(type, 'test', { data: [ ] }), context));
        assert(rule.is_match(make_request(type, 'test', { data: [ { } ] }), context));
        assert(rule.is_match(make_request(type, 'test', { data: [ ], bar: 'baz' }), context));
      }
    });

    it('userId in find', () => {
      const rule = new Rule('foo', { template: 'collection("test").find({ owner: userId() }).fetch()' });
      assert(rule.is_valid());
      assert(!rule.is_match(make_request('query', 'test', { find: { } }), context));
      assert(!rule.is_match(make_request('query', 'test', { find: true }), context));
      assert(!rule.is_match(make_request('query', 'test', { find: [ ] }), context));
      assert(!rule.is_match(make_request('query', 'test', { find: { bar: 'baz' } }), context));
      assert(!rule.is_match(make_request('query', 'test', { find: { owner: (context.id + 1) } }), context));
      assert(!rule.is_match(make_request('query', 'test', { find: { owner: context.id, bar: 'baz' } }), context));
      assert(rule.is_match(make_request('query', 'test', { find: { owner: context.id } }), context));
    });

    it('adds readAny() implicitly', () => {
      {
        const rule = new Rule('foo', { template: 'collection("test")' });
        assert(rule.is_valid());
        assert(rule.is_match(make_request('query', 'test', { find: { } }), context));
        assert(rule.is_match(make_request('query', 'test', { find: { bar: 'baz' } }), context));
      }
      {
        const rule = new Rule('foo', { template: 'collection("test").find({bar: any()})' });
        assert(rule.is_valid());
        assert(!rule.is_match(make_request('query', 'test', { find: { } }), context));
        assert(rule.is_match(make_request('query', 'test', { find: { bar: 'baz' } }), context));
      }
    });

    it('error on incomplete template', () => {
      assert.throws(() => new Rule('foo', { template: '({ })' }), /Incomplete template/);
      assert.throws(() => new Rule('foo', { template: '[ ]' }), /Invalid template/);
      assert.throws(() => new Rule('foo', { template: '5' }), /Invalid template/);
      assert.throws(() => new Rule('foo', { template: 'null' }), /Invalid template/);
    });
  });

  describe('Validator', () => {
    it('unparseable', () => {
      assert.throws(() => new Validator('() => ;'), /Unexpected token/);
    });

    it('broken', () => {
      const validator = new Validator('() => foo');
      assert.throws(() => validator.is_valid(), /Validation error/);
    });

    it('permitted', () => {
      const validator = new Validator(permitted_validator);
      assert(validator.is_valid({ id: 3 }));
      assert(validator.is_valid({ id: 3 }, { id: 0 }));
      assert(validator.is_valid({ id: 3 }, { id: 0 }, { id: 1 }));
    });

    it('user permitted', () => {
      const validator = new Validator(user_permitted_validator);
      assert(validator.is_valid({ id: 3 }, { id: 3 }));
      assert(validator.is_valid({ id: 3 }, { id: 13 }));
      assert(!validator.is_valid({ id: 3 }, { id: 4 }));
    });

    it('forbidden', () => {
      const validator = new Validator(forbidden_validator);
      assert(!validator.is_valid({ id: 3 }));
      assert(!validator.is_valid({ id: 3 }, { id: 3 }));
      assert(!validator.is_valid({ id: 3 }, { id: 0 }, { id: 1 }));
    });
  });

  describe('Validation', () => {
    const metadata = {
      collection: () => ({
        table: r.table(collection),
        get_matching_index: () => ({ name: 'id', fields: [ 'id' ] }),
      }),
      connection: () => utils.rdb_conn(),
    };

    const table_data = [ ];
    for (let i = 0; i < 10; ++i) {
      table_data.push({ id: i });
    }

    beforeEach('Clear test table', () =>
      r.table(collection).delete().run(utils.rdb_conn()));
    beforeEach('Populate test table', () =>
      r.table(collection).insert(table_data).run(utils.rdb_conn()));

    const make_run = (run_fn) =>
      (options, validator, limit) => new Promise((resolve, reject) => {
        let cancel_fn;
        const request = { options };
        const results = [ ];
        const ruleset = new Ruleset();
        ruleset.update([ new Rule('test', { template: 'any()', validator }) ]);
        options.collection = collection;

        const add_response = (res) => {
          res.data.forEach((item) => results.push(item));
          if (limit && results.length >= limit) {
            cancel_fn();
            resolve(results);
          }
        };

        cancel_fn = run_fn(
          request, { id: 3 }, ruleset, metadata, add_response,
          (res_or_error) => {
            if (res_or_error instanceof Error) {
              res_or_error.results = results;
              reject(res_or_error);
            } else {
              if (res_or_error) {
                add_response(res_or_error);
              }
              resolve(results);
            }
          });
      });

    describe('query', () => {
      const run = make_run(query.run);
      it('permitted', () =>
        run({ order: [ [ 'id' ], 'ascending' ] }, permitted_validator).then((res) => {
          assert.deepStrictEqual(res, table_data);
        }));

      it('half-permitted', () =>
        run({ order: [ [ 'id' ], 'ascending' ], above: [ { id: 3 }, 'closed' ] }, user_permitted_validator).then(() => {
          assert(false, 'Read should not have been permitted.');
        }).catch((err) => {
          assert.strictEqual(err.message, 'Operation not permitted.');
          // Check that we got the permitted row or nothing (race condition)
          if (err.results.length !== 0) {
            assert.deepStrictEqual(err.results, [ { id: 3 } ]);
          }
        }));

      it('forbidden', () =>
        run({ }, forbidden_validator).then(() => {
          assert(false, 'Read should not have been permitted.');
        }).catch((err) => {
          assert.strictEqual(err.message, 'Operation not permitted.');
          assert.strictEqual(err.results.length, 0);
        }));
    });

    describe('subscribe', () => {
      const run = make_run(subscribe.run);
      it('permitted with subsequent permitted change', () => {
        // TODO: can't use run, need to issue a write during the subscription
      });

      it('permitted with subsequent forbidden change', () => {
        // TODO: can't use run, need to issue a write during the subscription
      });

      it('half-permitted', () =>
        run({ order: [ [ 'id' ], 'ascending' ], above: [ { id: 3 }, 'closed' ] }, user_permitted_validator).then(() => {
          assert(false, 'Read should not have been permitted.');
        }).catch((err) => {
          assert.strictEqual(err.message, 'Operation not permitted.');
          // Check that we got the permitted row or nothing (race condition)
          if (err.results.length !== 0) {
            assert.deepStrictEqual(err.results, [ { id: 3 } ]);
          }
        }));

      it('forbidden', () =>
        run({ }, forbidden_validator).then(() => {
          assert(false, 'Read should not have been permitted.');
        }).catch((err) => {
          assert.strictEqual(err.message, 'Operation not permitted.');
          assert.strictEqual(err.results.length, 0);
        }));
    });

    describe('insert', () => {
      const run = make_run(insert.run);
      it('permitted', () =>
        run({ data: [ { id: 11 } ] }, permitted_validator).then((res) => {
          assert.strictEqual(res.length, 1);
          assert.strictEqual(res[0].id, 11);
          return r.table(collection).get(11).eq(null)
            .branch(r.error('write did not go through'), null).run(utils.rdb_conn());
        }));

      it('permitted based on context', () =>
        run({ data: [ { id: 13 } ] }, user_permitted_validator).then((res) => {
          assert.strictEqual(res.length, 1);
          assert.strictEqual(res[0].id, 13);
          return r.table(collection).get(13).eq(null)
            .branch(r.error('write did not go through'), null).run(utils.rdb_conn());
        }));

      it('forbidden', () =>
        run({ data: [ { id: 11 } ] }, forbidden_validator).then((res) => {
          assert.deepStrictEqual(res, [ { error: 'Operation not permitted.' } ]);
          return r.table(collection).get(11).ne(null)
            .branch(r.error('write went through'), null).run(utils.rdb_conn());
        }));

      it('forbidden based on context', () =>
        run({ data: [ { id: 11 } ] }, user_permitted_validator).then((res) => {
          assert.deepStrictEqual(res, [ { error: 'Operation not permitted.' } ]);
          return r.table(collection).get(11).ne(null)
            .branch(r.error('write went through'), null).run(utils.rdb_conn());
        }));
    });

    describe('store', () => {
      const run = make_run(store.run);
      it('permitted', () =>
        run({ data: [ { id: 11 } ] }, permitted_validator).then((res) => {
          assert.strictEqual(res.length, 1);
          assert.strictEqual(res[0].id, 11);
          return r.table(collection).get(11).eq(null)
            .branch(r.error('write did not go through'), null).run(utils.rdb_conn());
        }));

      it('permitted based on context', () =>
        run({ data: [ { id: 13 } ] }, user_permitted_validator).then((res) => {
          assert.strictEqual(res.length, 1);
          assert.strictEqual(res[0].id, 13);
          return r.table(collection).get(13).eq(null)
            .branch(r.error('write did not go through'), null).run(utils.rdb_conn());
        }));

      it('forbidden', () =>
        run({ data: [ { id: 11 } ] }, forbidden_validator).then((res) => {
          assert.deepStrictEqual(res, [ { error: 'Operation not permitted.' } ]);
          return r.table(collection).get(11).ne(null)
            .branch(r.error('write went through'), null).run(utils.rdb_conn());
        }));

      it('forbidden based on context', () =>
        run({ data: [ { id: 11 } ] }, user_permitted_validator).then((res) => {
          assert.deepStrictEqual(res, [ { error: 'Operation not permitted.' } ]);
          return r.table(collection).get(11).ne(null)
            .branch(r.error('write went through'), null).run(utils.rdb_conn());
        }));
    });

    describe('upsert', () => {
      const run = make_run(upsert.run);
      it('permitted', () =>
        run({ data: [ { id: 11 } ] }, permitted_validator).then((res) => {
          assert.strictEqual(res.length, 1);
          assert.strictEqual(res[0].id, 11);
          return r.table(collection).get(11).eq(null)
            .branch(r.error('write did not go through'), null).run(utils.rdb_conn());
        }));

      it('permitted based on context', () =>
        run({ data: [ { id: 13 } ] }, user_permitted_validator).then((res) => {
          assert.strictEqual(res.length, 1);
          assert.strictEqual(res[0].id, 13);
          return r.table(collection).get(13).eq(null)
            .branch(r.error('write did not go through'), null).run(utils.rdb_conn());
        }));

      it('forbidden', () =>
        run({ data: [ { id: 11 } ] }, forbidden_validator).then((res) => {
          assert.deepStrictEqual(res, [ { error: 'Operation not permitted.' } ]);
          return r.table(collection).get(11).ne(null)
            .branch(r.error('write went through'), null).run(utils.rdb_conn());
        }));

      it('forbidden based on context', () =>
        run({ data: [ { id: 11 } ] }, user_permitted_validator).then((res) => {
          assert.deepStrictEqual(res, [ { error: 'Operation not permitted.' } ]);
          return r.table(collection).get(11).ne(null)
            .branch(r.error('write went through'), null).run(utils.rdb_conn());
        }));
    });

    describe('update', () => {
      const run = make_run(update.run);
      it('permitted', () =>
        run({ data: [ { id: 1, value: 5 } ] }, permitted_validator).then((res) => {
          assert.strictEqual(res.length, 1);
          assert.strictEqual(res[0].id, 1);
          return r.table(collection).get(1).hasFields('value').not()
            .branch(r.error('write did not go through'), null).run(utils.rdb_conn());
        }));

      it('permitted based on context', () =>
        run({ data: [ { id: 3, value: 5 } ] }, user_permitted_validator).then((res) => {
          assert.strictEqual(res.length, 1);
          assert.strictEqual(res[0].id, 3);
          return r.table(collection).get(3).hasFields('value').not()
            .branch(r.error('write did not go through'), null).run(utils.rdb_conn());
        }));

      it('forbidden', () =>
        run({ data: [ { id: 1, value: 5 } ] }, forbidden_validator).then((res) => {
          assert.deepStrictEqual(res, [ { error: 'Operation not permitted.' } ]);
          return r.table(collection).get(1).hasFields('value')
            .branch(r.error('write went through'), null).run(utils.rdb_conn());
        }));

      it('forbidden based on context', () =>
        run({ data: [ { id: 1, value: 5 } ] }, user_permitted_validator).then((res) => {
          assert.deepStrictEqual(res, [ { error: 'Operation not permitted.' } ]);
          return r.table(collection).get(1).hasFields('value')
            .branch(r.error('write went through'), null).run(utils.rdb_conn());
        }));
    });

    describe('replace', () => {
      const run = make_run(replace.run);
      it('permitted', () =>
        run({ data: [ { id: 1, value: 5 } ] }, permitted_validator).then((res) => {
          assert.strictEqual(res.length, 1);
          assert.strictEqual(res[0].id, 1);
          return r.table(collection).get(1).hasFields('value').not()
            .branch(r.error('write did not go through'), null).run(utils.rdb_conn());
        }));

      it('permitted based on context', () =>
        run({ data: [ { id: 3, value: 5 } ] }, user_permitted_validator).then((res) => {
          assert.strictEqual(res.length, 1);
          assert.strictEqual(res[0].id, 3);
          return r.table(collection).get(3).hasFields('value').not()
            .branch(r.error('write did not go through'), null).run(utils.rdb_conn());
        }));

      it('forbidden', () =>
        run({ data: [ { id: 1, value: 5 } ] }, forbidden_validator).then((res) => {
          assert.deepStrictEqual(res, [ { error: 'Operation not permitted.' } ]);
          return r.table(collection).get(1).hasFields('value')
            .branch(r.error('write went through'), null).run(utils.rdb_conn());
        }));

      it('forbidden based on context', () =>
        run({ data: [ { id: 1, value: 5 } ] }, user_permitted_validator).then((res) => {
          assert.deepStrictEqual(res, [ { error: 'Operation not permitted.' } ]);
          return r.table(collection).get(1).hasFields('value')
            .branch(r.error('write went through'), null).run(utils.rdb_conn());
        }));
    });

    describe('remove', () => {
      const run = make_run(remove.run);
      it('permitted', () =>
        run({ data: [ { id: 1 } ] }, permitted_validator).then((res) => {
          assert.strictEqual(res.length, 1);
          assert.strictEqual(res[0].id, 1);
          return r.table(collection).get(1).ne(null)
            .branch(r.error('write did not go through'), null).run(utils.rdb_conn());
        }));

      it('permitted based on context', () =>
        run({ data: [ { id: 3 } ] }, user_permitted_validator).then((res) => {
          assert.strictEqual(res.length, 1);
          assert.strictEqual(res[0].id, 3);
          return r.table(collection).get(3).ne(null)
            .branch(r.error('write did not go through'), null).run(utils.rdb_conn());
        }));

      it('forbidden', () =>
        run({ data: [ { id: 1 } ] }, forbidden_validator).then((res) => {
          assert.deepStrictEqual(res, [ { error: 'Operation not permitted.' } ]);
          return r.table(collection).get(1).eq(null)
            .branch(r.error('write went through'), null).run(utils.rdb_conn());
        }));

      it('forbidden based on context', () =>
        run({ data: [ { id: 1 } ] }, user_permitted_validator).then((res) => {
          assert.deepStrictEqual(res, [ { error: 'Operation not permitted.' } ]);
          return r.table(collection).get(1).eq(null)
            .branch(r.error('write went through'), null).run(utils.rdb_conn());
        }));
    });
  });
};

const suite = (collection) => describe('Permissions', () => all_tests(collection));

module.exports = { suite };
