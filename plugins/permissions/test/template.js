'use strict';

const Rule = require('../rule');

const assert = require('assert');

const context = {id: 3, groups: ['admin', 'default', 'authenticated']};

// Convenience functions to make tests a little more concise
function makeRequest(type, collection, options) {
  if (collection !== null) {
    return {requestId: 5, type, options: Object.assign({collection}, options)};
  } else {
    return {requestId: 5, type, options};
  }
}

function isMatch(rule, type, collection, options) {
  return rule.isMatch(makeRequest(type, collection, options), context);
}

describe('Template', () => {
  it('any', () => {
    const rule = new Rule({template: 'any()'});

    const tests = [{},
                   {type: 'query', options: {collection: 'test'}},
                   {fake: 'bar'},
                   {options: {}},
                   {type: 'query', options: {fake: 'baz'}}];

    for (const t of tests) {
      assert(rule.isMatch(t, context));
      assert(rule.isValid());
    }
  });

  it('any read', () => {
    const rule = new Rule({template: 'collection(any()).anyRead()'});
    assert(rule.isValid());
    assert(!isMatch(rule, 'fake', 'test', {}));
    assert(!isMatch(rule, 'store', 'test', {}));
    assert(!isMatch(rule, 'query', null, {}));
    assert(isMatch(rule, 'query', 'fake', {}));
    assert(isMatch(rule, 'query', 'fake', {find: {}}));
    assert(isMatch(rule, 'query', 'test', {bar: 'baz'}));
    assert(isMatch(rule, 'query', 'test', {findAll: [{}, {}]}));
    assert(!isMatch(rule, 'subscribe', null, {}));
    assert(isMatch(rule, 'subscribe', 'fake', {}));
    assert(isMatch(rule, 'subscribe', 'fake', {find: {}}));
    assert(isMatch(rule, 'subscribe', 'test', {bar: 'baz'}));
    assert(isMatch(rule, 'subscribe', 'test', {findAll: [{}, {}]}));
  });

  it('any read with collection', () => {
    const rule = new Rule({template: 'collection("test").anyRead()'});
    assert(rule.isValid());
    assert(!isMatch(rule, 'query', 'fake', {}));
    assert(isMatch(rule, 'query', 'test', {}));
    assert(isMatch(rule, 'query', 'test', {}));
    assert(isMatch(rule, 'query', 'test', {}));
    assert(isMatch(rule, 'subscribe', 'test', {}));
    assert(isMatch(rule, 'subscribe', 'test', {}));
    assert(isMatch(rule, 'subscribe', 'test', {}));
    assert(isMatch(rule, 'subscribe', 'test', {}));
  });

  it('any read with order', () => {
    // TODO: allow for any number of fields in order
    const rule = new Rule({template:
      'collection("test").order(any(), any()).anyRead()'});
    assert(rule.isValid());
    assert(!isMatch(rule, 'query', 'fake', {order: ['foo', 'ascending']}));
    assert(!isMatch(rule, 'query', 'test', {}));
    assert(!isMatch(rule, 'query', 'test', {order: ['baz']}));
    assert(!isMatch(rule, 'query', 'test', {order: ['baz', 'fake']}));
    assert(!isMatch(rule, 'query', 'test', {order: [['fake']]}));
    assert(isMatch(rule, 'query', 'test', {order: [['foo'], 'ascending']}));
    assert(isMatch(rule, 'query', 'test', {order: [['bar'], 'descending']}));
    assert(isMatch(rule, 'query', 'test', {order: [['baz'], 'fake']}));
    assert(isMatch(rule, 'query', 'test', {find: {}, order: [['baz'], 'fake']}));
    assert(isMatch(rule, 'query', 'test', {findAll: [{}], order: [['baz'], 'fake']}));
    assert(isMatch(rule, 'query', 'test', {fake: 'baz', order: [['baz'], 'fake']}));
  });

  it('any read with find', () => {
    const rule = new Rule({template: 'collection("test").find(any()).anyRead()'});
    assert(rule.isValid());
    assert(!isMatch(rule, 'query', 'fake', {find: {}}));
    assert(!isMatch(rule, 'query', 'test', {}));
    assert(isMatch(rule, 'query', 'test', {find: {}}));
    assert(isMatch(rule, 'query', 'test', {find: {}, fake: 'baz'}));
  });

  it('any read with findAll', () => {
    // TODO: allow for any number of arguments in findAll
    const rule = new Rule({template: 'collection("test").findAll(any()).anyRead()'});
    assert(rule.isValid());
    assert(!isMatch(rule, 'query', 'fake', {findAll: {}}));
    assert(!isMatch(rule, 'query', 'test', {}));
    assert(isMatch(rule, 'query', 'test', {findAll: [{}]}));
    assert(isMatch(rule, 'query', 'test', {findAll: [{}], fake: 'baz'}));
  });

  it('single key in findAll', () => {
    const rule = new Rule({template:
      'collection("test").findAll({owner: userId()}).fetch()'});
    assert(rule.isValid());
    assert(!isMatch(rule, 'query', 'test', {findAll: {}}));
    assert(!isMatch(rule, 'query', 'test', {findAll: true}));
    assert(!isMatch(rule, 'query', 'test', {findAll: []}));
    assert(!isMatch(rule, 'query', 'test', {findAll: [{bar: 'baz'}]}));
    assert(!isMatch(rule, 'query', 'test', {findAll: [{owner: (context.id + 1)}]}));
    assert(!isMatch(rule, 'query', 'test',
      {findAll: [{owner: context.id, bar: 'baz'}]}));
    assert(!isMatch(rule, 'query', 'test',
      {findAll: [{owner: context.id}, {other: context.id}]}));
    assert(isMatch(rule, 'query', 'test', {findAll: [{owner: context.id}]}));
  });

  it('multiple keys in findAll', () => {
    const rule = new Rule({template:
      'collection("test").findAll({owner: userId(), key: any()}).fetch()'});
    assert(rule.isValid());
    assert(!isMatch(rule, 'query', 'test', {findAll: {}}));
    assert(!isMatch(rule, 'query', 'test', {findAll: true}));
    assert(!isMatch(rule, 'query', 'test', {findAll: []}));
    assert(!isMatch(rule, 'query', 'test', {findAll: [{bar: 'baz'}]}));
    assert(!isMatch(rule, 'query', 'test', {findAll: [{owner: (context.id + 1)}]}));
    assert(!isMatch(rule, 'query', 'test',
      {findAll: [{owner: context.id, bar: 'baz'}]}));
    assert(isMatch(rule, 'query', 'test', {findAll: [{owner: context.id, key: 3}]}));
  });

  it('multiple items in findAll', () => {
    const rule = new Rule({template:
      'collection("test").findAll({a: userId()}, {b: userId()})'});
    assert(rule.isValid());
    assert(!isMatch(rule, 'query', 'test', {findAll: {}}));
    assert(!isMatch(rule, 'query', 'test', {findAll: true}));
    assert(!isMatch(rule, 'query', 'test', {findAll: []}));
    assert(!isMatch(rule, 'query', 'test', {findAll: [{bar: 'baz'}]}));
    assert(!isMatch(rule, 'query', 'test',
      {findAll: [{a: (context.id + 1)}, {b: context.id}]}));
    assert(!isMatch(rule, 'query', 'test', {findAll: [{a: context.id, bar: 'baz'}]}));
    assert(!isMatch(rule, 'query', 'test', {findAll: [{a: context.id, b: context.id}]}));
    assert(!isMatch(rule, 'query', 'test', {findAll: [{a: context.id}]}));
    assert(!isMatch(rule, 'query', 'test', {findAll: [{b: context.id}]}));
    assert(!isMatch(rule, 'query', 'test',
      {findAll: [{a: context.id}, {b: context.id, bar: 'baz'}]}));
    assert(isMatch(rule, 'query', 'test',
      {findAll: [{a: context.id}, {b: context.id}]}));
  });

  it('collection fetch', () => {
    const rule = new Rule({template: 'collection("test").fetch()'});
    assert(rule.isValid());
    assert(!isMatch(rule, 'query', 'fake', {}));
    assert(!isMatch(rule, 'query', 'test', {bar: 'baz'}));
    assert(!isMatch(rule, 'query', 'test', {find: {id: 5}}));
    assert(isMatch(rule, 'query', 'test', {}));
  });

  it('collection watch', () => {
    const rule = new Rule({template: 'collection("test").watch()'});
    assert(rule.isValid());
    assert(!isMatch(rule, 'subscribe', 'fake', {}));
    assert(!isMatch(rule, 'subscribe', 'test', {bar: 'baz'}));
    assert(!isMatch(rule, 'subscribe', 'test', {find: {id: 5}}));
    assert(isMatch(rule, 'subscribe', 'test', {}));
  });

  for (const type of ['store', 'update', 'insert', 'upsert', 'replace', 'remove']) {
    it(`collection ${type}`, () => {
      const rule = new Rule({template: `collection("test").${type}(any())`});
      assert(rule.isValid());
      assert(!isMatch(rule, type, 'test', {}));
      assert(!isMatch(rule, type, 'test', {data: {}}));
      assert(!isMatch(rule, type, 'test', {data: []}));
      assert(!isMatch(rule, type, 'fake', {data: [{}]}));
      assert(!isMatch(rule, type, 'test', {data: [{}], fake: 6}));
      assert(isMatch(rule, type, 'test', {data: [{}]}));
    });
    it(`collection ${type} batch`, () => {
      const rule = new Rule({template: `collection("test").${type}(anyArray(any()))`});
      assert(rule.isValid());
      assert(!isMatch(rule, type, 'test', {}));
      assert(!isMatch(rule, type, 'test', {data: {}}));
      assert(!isMatch(rule, type, 'test', {data: [{}], fake: 6}));
      assert(!isMatch(rule, type, 'fake', {data: [{}]}));
      assert(isMatch(rule, type, 'test', {data: []}));
      assert(isMatch(rule, type, 'test', {data: [{}]}));
      assert(isMatch(rule, type, 'test', {data: [{}, {bar: 'baz'}]}));
    });
  }

  it('any write', () => {
    const rule = new Rule({template: 'collection("test").anyWrite()'});
    assert(rule.isValid());
    assert(!isMatch(rule, 'fake', 'test', {}));
    assert(!isMatch(rule, 'query', 'test', {}));
    assert(!isMatch(rule, 'store', null, {}));

    for (const type of ['store', 'update', 'insert', 'upsert', 'replace', 'remove']) {
      assert(!isMatch(rule, type, 'fake', {}));
      assert(isMatch(rule, type, 'test', {data: []}));
      assert(isMatch(rule, type, 'test', {data: [{}]}));
      assert(isMatch(rule, type, 'test', {data: [], bar: 'baz'}));
    }
  });

  it('userId in find', () => {
    const rule = new Rule({template:
      'collection("test").find({owner: userId()}).fetch()'});
    assert(rule.isValid());
    assert(!isMatch(rule, 'query', 'test', {find: {}}));
    assert(!isMatch(rule, 'query', 'test', {find: true}));
    assert(!isMatch(rule, 'query', 'test', {find: []}));
    assert(!isMatch(rule, 'query', 'test', {find: {bar: 'baz'}}));
    assert(!isMatch(rule, 'query', 'test', {find: {owner: (context.id + 1)}}));
    assert(!isMatch(rule, 'query', 'test', {find: {owner: context.id, bar: 'baz'}}));
    assert(isMatch(rule, 'query', 'test', {find: {owner: context.id}}));
  });

  it('adds readAny() implicitly', () => {
    {
      const rule = new Rule({template: 'collection("test")'});
      assert(rule.isValid());
      assert(isMatch(rule, 'query', 'test', {find: {}}));
      assert(isMatch(rule, 'query', 'test', {find: {bar: 'baz'}}));
    }
    {
      const rule = new Rule({template: 'collection("test").find({bar: any()})'});
      assert(rule.isValid());
      assert(!isMatch(rule, 'query', 'test', {find: {}}));
      assert(isMatch(rule, 'query', 'test', {find: {bar: 'baz'}}));
    }
  });

  it('error on incomplete template', () => {
    assert.throws(() => new Rule({template: '({})'}), /Incomplete template/);
    assert.throws(() => new Rule({template: '[]'}), /Invalid template/);
    assert.throws(() => new Rule({template: '5'}), /Invalid template/);
    assert.throws(() => new Rule({template: 'null'}), /Invalid template/);
  });
});
