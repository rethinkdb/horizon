'use strict';

require('source-map-support').install();

const Rule = require('../rule');

const assert = require('assert');

const makeRequest = (type, collection, options) => {
  if (collection !== null) {
    return {request_id: 5, type, options: Object.assign({collection}, options)};
  } else {
    return {request_id: 5, type, options};
  }
};

const context = {id: 3, groups: ['admin', 'default', 'authenticated']};

describe('Template', () => {
  it('any', () => {
    const rule = new Rule({template: 'any()'});

    const tests = [{ },
                   {type: 'query', options: {collection: 'test'}},
                   {fake: 'bar'},
                   {options: { }},
                   {type: 'query', options: {fake: 'baz'}}];

    for (const t of tests) {
      assert(rule.isMatch(t, context));
      assert(rule.isValid());
    }
  });

  it('any read', () => {
    const rule = new Rule({template: 'collection(any()).anyRead()'});
    assert(rule.isValid());
    assert(!rule.isMatch(makeRequest('fake', 'test', { }), context));
    assert(!rule.isMatch(makeRequest('store', 'test', { }), context));
    assert(!rule.isMatch(makeRequest('query', null, { }), context));
    assert(rule.isMatch(makeRequest('query', 'fake', { }), context));
    assert(rule.isMatch(makeRequest('query', 'fake', {find: { }}), context));
    assert(rule.isMatch(makeRequest('query', 'test', {bar: 'baz'}), context));
    assert(rule.isMatch(makeRequest('query', 'test', {find_all: [{ }, { }]}), context));
    assert(!rule.isMatch(makeRequest('subscribe', null, { }), context));
    assert(rule.isMatch(makeRequest('subscribe', 'fake', { }), context));
    assert(rule.isMatch(makeRequest('subscribe', 'fake', {find: { }}), context));
    assert(rule.isMatch(makeRequest('subscribe', 'test', {bar: 'baz'}), context));
    assert(rule.isMatch(makeRequest('subscribe', 'test', {find_all: [{ }, { }]}), context));
  });

  it('any read with collection', () => {
    const rule = new Rule({template: 'collection("test").anyRead()'});
    assert(rule.isValid());
    assert(!rule.isMatch(makeRequest('query', 'fake', { }), context));
    assert(rule.isMatch(makeRequest('query', 'test', { }), context));
    assert(rule.isMatch(makeRequest('query', 'test', { }), context));
    assert(rule.isMatch(makeRequest('query', 'test', { }), context));
    assert(rule.isMatch(makeRequest('subscribe', 'test', { }), context));
    assert(rule.isMatch(makeRequest('subscribe', 'test', { }), context));
    assert(rule.isMatch(makeRequest('subscribe', 'test', { }), context));
    assert(rule.isMatch(makeRequest('subscribe', 'test', { }), context));
  });

  it('any read with order', () => {
    // TODO: allow for any number of fields in order
    const rule = new Rule({template: 'collection("test").order(any(), any()).anyRead()'});
    assert(rule.isValid());
    assert(!rule.isMatch(makeRequest('query', 'fake', {order: ['foo', 'ascending']}), context));
    assert(!rule.isMatch(makeRequest('query', 'test', { }), context));
    assert(!rule.isMatch(makeRequest('query', 'test', {order: ['baz']}), context));
    assert(!rule.isMatch(makeRequest('query', 'test', {order: ['baz', 'fake']}), context));
    assert(!rule.isMatch(makeRequest('query', 'test', {order: [['fake']]}), context));
    assert(rule.isMatch(makeRequest('query', 'test', {order: [['foo'], 'ascending']}), context));
    assert(rule.isMatch(makeRequest('query', 'test', {order: [['bar'], 'descending']}), context));
    assert(rule.isMatch(makeRequest('query', 'test', {order: [['baz'], 'fake']}), context));
    assert(rule.isMatch(makeRequest('query', 'test', {find: { }, order: [['baz'], 'fake']}), context));
    assert(rule.isMatch(makeRequest('query', 'test', {find_all: [{ }], order: [['baz'], 'fake']}), context));
    assert(rule.isMatch(makeRequest('query', 'test', {fake: 'baz', order: [['baz'], 'fake']}), context));
  });

  it('any read with find', () => {
    const rule = new Rule({template: 'collection("test").find(any()).anyRead()'});
    assert(rule.isValid());
    assert(!rule.isMatch(makeRequest('query', 'fake', {find: { }}), context));
    assert(!rule.isMatch(makeRequest('query', 'test', { }), context));
    assert(rule.isMatch(makeRequest('query', 'test', {find: { }}), context));
    assert(rule.isMatch(makeRequest('query', 'test', {find: { }, fake: 'baz'}), context));
  });

  it('any read with findAll', () => {
    // TODO: allow for any number of arguments in findAll
    const rule = new Rule({template: 'collection("test").findAll(any()).anyRead()'});
    assert(rule.isValid());
    assert(!rule.isMatch(makeRequest('query', 'fake', {find_all: { }}), context));
    assert(!rule.isMatch(makeRequest('query', 'test', { }), context));
    assert(rule.isMatch(makeRequest('query', 'test', {find_all: [{ }]}), context));
    assert(rule.isMatch(makeRequest('query', 'test', {find_all: [{ }], fake: 'baz'}), context));
  });

  it('single key in findAll', () => {
    const rule = new Rule({template: 'collection("test").findAll({ owner: userId() }).fetch()'});
    assert(rule.isValid());
    assert(!rule.isMatch(makeRequest('query', 'test', {find_all: { }}), context));
    assert(!rule.isMatch(makeRequest('query', 'test', {find_all: true}), context));
    assert(!rule.isMatch(makeRequest('query', 'test', {find_all: []}), context));
    assert(!rule.isMatch(makeRequest('query', 'test', {find_all: [{bar: 'baz'}]}), context));
    assert(!rule.isMatch(makeRequest('query', 'test', {find_all: [{owner: (context.id + 1)}]}), context));
    assert(!rule.isMatch(makeRequest('query', 'test', {find_all: [{owner: context.id, bar: 'baz'}]}), context));
    assert(!rule.isMatch(makeRequest('query', 'test', {find_all: [{owner: context.id}, {other: context.id}]}), context));
    assert(rule.isMatch(makeRequest('query', 'test', {find_all: [{owner: context.id}]}), context));
  });

  it('multiple keys in findAll', () => {
    const rule = new Rule({template: 'collection("test").findAll({ owner: userId(), key: any() }).fetch()'});
    assert(rule.isValid());
    assert(!rule.isMatch(makeRequest('query', 'test', {find_all: { }}), context));
    assert(!rule.isMatch(makeRequest('query', 'test', {find_all: true}), context));
    assert(!rule.isMatch(makeRequest('query', 'test', {find_all: []}), context));
    assert(!rule.isMatch(makeRequest('query', 'test', {find_all: [{bar: 'baz'}]}), context));
    assert(!rule.isMatch(makeRequest('query', 'test', {find_all: [{owner: (context.id + 1)}]}), context));
    assert(!rule.isMatch(makeRequest('query', 'test', {find_all: [{owner: context.id, bar: 'baz'}]}), context));
    assert(rule.isMatch(makeRequest('query', 'test', {find_all: [{owner: context.id, key: 3}]}), context));
  });

  it('multiple items in findAll', () => {
    const rule = new Rule({template: 'collection("test").findAll({ a: userId() }, { b: userId() })'});
    assert(rule.isValid());
    assert(!rule.isMatch(makeRequest('query', 'test', {find_all: { }}), context));
    assert(!rule.isMatch(makeRequest('query', 'test', {find_all: true}), context));
    assert(!rule.isMatch(makeRequest('query', 'test', {find_all: []}), context));
    assert(!rule.isMatch(makeRequest('query', 'test', {find_all: [{bar: 'baz'}]}), context));
    assert(!rule.isMatch(makeRequest('query', 'test', {find_all: [{a: (context.id + 1)}, {b: context.id}]}), context));
    assert(!rule.isMatch(makeRequest('query', 'test', {find_all: [{a: context.id, bar: 'baz'}]}), context));
    assert(!rule.isMatch(makeRequest('query', 'test', {find_all: [{a: context.id, b: context.id}]}), context));
    assert(!rule.isMatch(makeRequest('query', 'test', {find_all: [{a: context.id}]}), context));
    assert(!rule.isMatch(makeRequest('query', 'test', {find_all: [{b: context.id}]}), context));
    assert(!rule.isMatch(makeRequest('query', 'test', {find_all: [{a: context.id}, {b: context.id, bar: 'baz'}]}), context));
    assert(rule.isMatch(makeRequest('query', 'test', {find_all: [{a: context.id}, {b: context.id}]}), context));
  });

  it('collection fetch', () => {
    const rule = new Rule({template: 'collection("test").fetch()'});
    assert(rule.isValid());
    assert(!rule.isMatch(makeRequest('query', 'fake', { }), context));
    assert(!rule.isMatch(makeRequest('query', 'test', {bar: 'baz'}), context));
    assert(!rule.isMatch(makeRequest('query', 'test', {find: {id: 5}}), context));
    assert(rule.isMatch(makeRequest('query', 'test', { }), context));
  });

  it('collection watch', () => {
    const rule = new Rule({template: 'collection("test").watch()'});
    assert(rule.isValid());
    assert(!rule.isMatch(makeRequest('subscribe', 'fake', { }), context));
    assert(!rule.isMatch(makeRequest('subscribe', 'test', {bar: 'baz'}), context));
    assert(!rule.isMatch(makeRequest('subscribe', 'test', {find: {id: 5}}), context));
    assert(rule.isMatch(makeRequest('subscribe', 'test', { }), context));
  });

  for (const type of ['store', 'update', 'insert', 'upsert', 'replace', 'remove']) {
    it(`collection ${type}`, () => {
      const rule = new Rule({template: `collection("test").${type}(any())`});
      assert(rule.isValid());
      assert(!rule.isMatch(makeRequest(type, 'test', { }), context));
      assert(!rule.isMatch(makeRequest(type, 'test', {data: { }}), context));
      assert(!rule.isMatch(makeRequest(type, 'test', {data: []}), context));
      assert(!rule.isMatch(makeRequest(type, 'fake', {data: [{ }]}), context));
      assert(!rule.isMatch(makeRequest(type, 'test', {data: [{ }], fake: 6}), context));
      assert(rule.isMatch(makeRequest(type, 'test', {data: [{ }]}), context));
    });
    it(`collection ${type} batch`, () => {
      const rule = new Rule({template: `collection("test").${type}(anyArray(any()))`});
      assert(rule.isValid());
      assert(!rule.isMatch(makeRequest(type, 'test', { }), context));
      assert(!rule.isMatch(makeRequest(type, 'test', {data: { }}), context));
      assert(!rule.isMatch(makeRequest(type, 'test', {data: [{ }], fake: 6}), context));
      assert(!rule.isMatch(makeRequest(type, 'fake', {data: [{ }]}), context));
      assert(rule.isMatch(makeRequest(type, 'test', {data: []}), context));
      assert(rule.isMatch(makeRequest(type, 'test', {data: [{ }]}), context));
      assert(rule.isMatch(makeRequest(type, 'test', {data: [{ }, {bar: 'baz'}]}), context));
    });
  }

  it('any write', () => {
    const rule = new Rule({template: 'collection("test").anyWrite()'});
    assert(rule.isValid());
    assert(!rule.isMatch(makeRequest('fake', 'test', { }), context));
    assert(!rule.isMatch(makeRequest('query', 'test', { }), context));
    assert(!rule.isMatch(makeRequest('store', null, { }), context));

    for (const type of ['store', 'update', 'insert', 'upsert', 'replace', 'remove']) {
      assert(!rule.isMatch(makeRequest(type, 'fake', { }), context));
      assert(rule.isMatch(makeRequest(type, 'test', {data: []}), context));
      assert(rule.isMatch(makeRequest(type, 'test', {data: [{ }]}), context));
      assert(rule.isMatch(makeRequest(type, 'test', {data: [], bar: 'baz'}), context));
    }
  });

  it('userId in find', () => {
    const rule = new Rule({template: 'collection("test").find({ owner: userId() }).fetch()'});
    assert(rule.isValid());
    assert(!rule.isMatch(makeRequest('query', 'test', {find: { }}), context));
    assert(!rule.isMatch(makeRequest('query', 'test', {find: true}), context));
    assert(!rule.isMatch(makeRequest('query', 'test', {find: []}), context));
    assert(!rule.isMatch(makeRequest('query', 'test', {find: {bar: 'baz'}}), context));
    assert(!rule.isMatch(makeRequest('query', 'test', {find: {owner: (context.id + 1)}}), context));
    assert(!rule.isMatch(makeRequest('query', 'test', {find: {owner: context.id, bar: 'baz'}}), context));
    assert(rule.isMatch(makeRequest('query', 'test', {find: {owner: context.id}}), context));
  });

  it('adds readAny() implicitly', () => {
    {
      const rule = new Rule({template: 'collection("test")'});
      assert(rule.isValid());
      assert(rule.isMatch(makeRequest('query', 'test', {find: { }}), context));
      assert(rule.isMatch(makeRequest('query', 'test', {find: {bar: 'baz'}}), context));
    }
    {
      const rule = new Rule({template: 'collection("test").find({bar: any()})'});
      assert(rule.isValid());
      assert(!rule.isMatch(makeRequest('query', 'test', {find: { }}), context));
      assert(rule.isMatch(makeRequest('query', 'test', {find: {bar: 'baz'}}), context));
    }
  });

  it('error on incomplete template', () => {
    assert.throws(() => new Rule({template: '({ })'}), /Incomplete template/);
    assert.throws(() => new Rule({template: '[ ]'}), /Invalid template/);
    assert.throws(() => new Rule({template: '5'}), /Invalid template/);
    assert.throws(() => new Rule({template: 'null'}), /Invalid template/);
  });
});
