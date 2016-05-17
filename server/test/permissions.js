'use strict';

const Rule = require('../src/permissions/rule').Rule;

const assert = require('assert');

const make_request = (type, collection, options) => {
  if (collection !== null) {
    return { request_id: 5, type, options: Object.assign({ collection }, options) };
  } else {
    return { request_id: 5, type, options };
  }
};

const context = { id: 123, groups: [ 'admin', 'default', 'authenticated' ] };

describe('Permissions', () => {
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
});
