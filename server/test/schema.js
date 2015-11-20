'use strict';

const fusion_protocol = require('../src/schema/fusion_protocol');
const utils = require('./utils');

const assert = require('assert');
const { _extend: extend } = require('util');

describe('Schema', () => {
  const test_required_fields = (schema, valid, fields) => {
    fields.forEach((f) => {
      const request = extend({ }, valid); // Create a shallow copy
      request[f] = undefined;
      const { error } = schema.validate(request);
      utils.check_error(error, `"${f}" is required`);
    });
  };

  const test_extra_field = (schema, valid) => {
    const request = extend({ }, valid); // Create a shallow copy
    request.fake_field = false;
    const { error } = schema.validate(request);
    utils.check_error(error, '"fake_field" is not allowed');
  };

  describe('Protocol', () => {
    describe('Request', () => {
      const valid = {
        request_id: 1,
        type: 'query',
        options: { },
      };

      it('valid', () => {
        const { error, value } = fusion_protocol.request.validate(valid);
        assert.ifError(error);
        assert.deepStrictEqual(value, valid);
      });

      it('required fields', () => {
        test_required_fields(fusion_protocol.request, valid,
                             [ 'request_id', 'type', 'options' ]);
      });

      it('wrong "request_id" type', () => {
        const request = extend({ }, valid);
        request.request_id = 'str';
        const { error } = fusion_protocol.request.validate(request);
        utils.check_error(error, '"request_id" must be a number');
      });

      it('wrong "type" type', () => {
        const request = extend({ }, valid);
        request.type = 5;
        const { error } = fusion_protocol.request.validate(request);
        utils.check_error(error, '"type" must be a string');
      });

      it('wrong "options" type', () => {
        const request = extend({ }, valid);
        request.options = [ 5, 6 ];
        const { error } = fusion_protocol.request.validate(request);
        utils.check_error(error, '"options" must be an object');
      });

      it('extra field', () => {
        test_extra_field(fusion_protocol.request, valid);
      });
    });

    describe('Write', () => {
      const write_without_id = {
        collection: 'fusion',
        data: [ { field: 4 } ],
      };

      const write_with_id = {
        collection: 'fusion',
        data: [ { id: 5, field: 4 } ],
      };

      // In order to reduce the number of tests, these were written assuming
      // that only two types of write schemas exist: id-required and id-optional.
      // If this ever changes, this test will fail and more tests may need to
      // be added.
      it('common write schemas', () => {
        // These schemas do not require an id in each "data" object
        assert.equal(fusion_protocol.insert, fusion_protocol.upsert);
        assert.equal(fusion_protocol.insert, fusion_protocol.store);

        // These schemas require an id in each "data" object
        assert.equal(fusion_protocol.replace, fusion_protocol.update);
        assert.equal(fusion_protocol.replace, fusion_protocol.remove);
      });

      describe('Insert', () => {
        it('with id', () => {
          const { error } = fusion_protocol.insert.validate(write_with_id);
          assert.ifError(error);
        });

        it('without id', () => {
          const { error } = fusion_protocol.insert.validate(write_without_id);
          assert.ifError(error);
        });

        it('required fields', () => {
          test_required_fields(fusion_protocol.insert, write_with_id,
                               [ 'collection', 'data' ]);
        });

        it('extra field', () => {
          test_extra_field(fusion_protocol.insert, write_with_id);
        });

        it('wrong "collection" type', () => {
          const request = extend({ }, write_with_id);
          request.collection = true;
          const { error } = fusion_protocol.insert.validate(request);
          utils.check_error(error, '"collection" must be a string');
        });

        it('wrong "collection" value', () => {
          const request = extend({ }, write_with_id);
          request.collection = '*.*';
          const { error } = fusion_protocol.insert.validate(request);
          utils.check_error(error, '"collection" must only contain alpha-numeric and underscore characters');
        });

        it('wrong "data" type', () => {
          const request = extend({ }, write_with_id);
          request.data = 'abc';
          const { error } = fusion_protocol.insert.validate(request);
          utils.check_error(error, '"data" must be an array');
        });

        it('wrong "data" member type', () => {
          const request = extend({ }, write_with_id);
          request.data = [ 7 ];
          const { error } = fusion_protocol.insert.validate(request);
          utils.check_error(error, '"0" must be an object');
        });

        it('empty "data" array', () => {
          const request = extend({ }, write_with_id);
          request.data = [ ];
          const { error } = fusion_protocol.insert.validate(request);
          utils.check_error(error, '"data" must contain at least 1 items');
        });
      });

      describe('Replace', () => {
        it('with id', () => {
          const { error } = fusion_protocol.replace.validate(write_with_id);
          assert.ifError(error);
        });

        it('without id', () => {
          const { error } = fusion_protocol.replace.validate(write_without_id);
          utils.check_error(error, '"id" is required');
        });

        it('required fields', () => {
          test_required_fields(fusion_protocol.replace, write_with_id,
                               [ 'collection', 'data' ]);
        });

        it('extra field', () => {
          test_extra_field(fusion_protocol.replace, write_with_id);
        });

        it('wrong "collection" type', () => {
          const request = extend({ }, write_with_id);
          request.collection = true;
          const { error } = fusion_protocol.replace.validate(request);
          utils.check_error(error, '"collection" must be a string');
        });

        it('wrong "collection" value', () => {
          const request = extend({ }, write_with_id);
          request.collection = '*.*';
          const { error } = fusion_protocol.insert.validate(request);
          utils.check_error(error, '"collection" must only contain alpha-numeric and underscore characters');
        });

        it('wrong "data" type', () => {
          const request = extend({ }, write_with_id);
          request.data = 'abc';
          const { error } = fusion_protocol.replace.validate(request);
          utils.check_error(error, '"data" must be an array');
        });

        it('wrong "data" member type', () => {
          const request = extend({ }, write_with_id);
          request.data = [ 7 ];
          const { error } = fusion_protocol.replace.validate(request);
          utils.check_error(error, '"0" must be an object');
        });

        it('empty "data" array', () => {
          const request = extend({ }, write_with_id);
          request.data = [ ];
          const { error } = fusion_protocol.replace.validate(request);
          utils.check_error(error, '"data" must contain at least 1 items');
        });
      });
    });

    describe('Read', () => {
      // The 'query' and 'subscribe' requests use the same schema
      it('common read schemas', () => {
        assert.equal(fusion_protocol.query, fusion_protocol.subscribe);
      });

      describe('no selection', () => {
        const valid = {
          collection: 'fusion',
        };

        it('valid', () => {
          const { value, error } = fusion_protocol.query.validate(valid);
          assert.ifError(error);
          assert.deepStrictEqual(value, valid);
        });

        it('required fields', () => {
          test_required_fields(fusion_protocol.query, valid,
                               [ 'collection' ]);
        });

        it('extra field', () => {
          test_extra_field(fusion_protocol.query, valid);
        });

        it('order', () => {
          const request = extend({ }, valid);
          request.order = [ [ 'id' ], 'ascending' ];
          const { value, error } = fusion_protocol.query.validate(request);
          assert.ifError(error);
          assert.deepStrictEqual(value, request);
        });

        it('above', () => {
          const request = extend({ }, valid);
          request.order = [ [ 'id' ], 'ascending' ];
          request.above = [ { id: 10 }, 'open' ];
          const { value, error } = fusion_protocol.query.validate(request);
          assert.ifError(error);
          assert.deepStrictEqual(value, request);
        });

        it('below', () => {
          const request = extend({ }, valid);
          request.order = [ [ 'id' ], 'ascending' ];
          request.below = [ { id: 5 }, 'open' ];
          const { value, error } = fusion_protocol.query.validate(request);
          assert.ifError(error);
          assert.deepStrictEqual(value, request);
        });

        it('limit', () => {
          const request = extend({ }, valid);
          request.limit = 2;
          const { value, error } = fusion_protocol.query.validate(request);
          assert.ifError(error);
          assert.deepStrictEqual(value, request);
        });

        it('above and below and limit', () => {
          const request = extend({ }, valid);
          request.order = [ [ 'id' ], 'ascending' ];
          request.below = [ { id: 0 }, 'closed' ];
          request.below = [ { id: 5 }, 'closed' ];
          request.limit = 4;
          const { value, error } = fusion_protocol.query.validate(request);
          assert.ifError(error);
          assert.deepStrictEqual(value, request);
        });

        it('wrong "collection" type', () => {
          const request = extend({ }, valid);
          request.collection = null;
          const { error } = fusion_protocol.query.validate(request);
          utils.check_error(error, '"collection" must be a string');
        });

        it('wrong "collection" value', () => {
          const request = extend({ }, valid);
          request.collection = '*.*';
          const { error } = fusion_protocol.query.validate(request);
          utils.check_error(error, '"collection" must only contain alpha-numeric and underscore characters');
        });

        it('wrong "order" type', () => {
          const request = extend({ }, valid);
          request.order = true;
          const { error } = fusion_protocol.query.validate(request);
          utils.check_error(error, '"order" must be an array');
        });

        it('wrong "order" value', () => {
          const request = extend({ }, valid);
          {
            request.order = [ ];
            const { error } = fusion_protocol.query.validate(request);
            utils.check_error(error, '"order" does not contain [fields, direction]');
          } {
            request.order = [ [ 'id' ] ];
            const { error } = fusion_protocol.query.validate(request);
            utils.check_error(error, '"order" does not contain [direction]');
          } {
            request.order = [ { }, 'ascending' ];
            const { error } = fusion_protocol.query.validate(request);
            utils.check_error(error, '"fields" must be an array');
          } {
            request.order = [ [ ], 'descending' ];
            const { error } = fusion_protocol.query.validate(request);
            utils.check_error(error, '"fields" must contain at least 1 item');
          } {
            request.order = [ [ 'field' ], 'baleeted' ];
            const { error } = fusion_protocol.query.validate(request);
            utils.check_error(error, '"direction" must be one of [ascending, descending]');
          }
        });

        it('"above" without "order"', () => {
          const request = extend({ }, valid);
          request.above = [ { id: 5 }, 'open' ];
          const { value, error } = fusion_protocol.query.validate(request);
          assert.ifError(error);
          assert.deepStrictEqual(value, request);
        });

        it('wrong "above" type', () => {
          const request = extend({ }, valid);
          request.above = true;
          const { error } = fusion_protocol.query.validate(request);
          utils.check_error(error, '"above" must be an array');
        });

        it('wrong "above" value', () => {
          const request = extend({ }, valid);
          {
            request.above = [ ];
            const { error } = fusion_protocol.query.validate(request);
            utils.check_error(error, '"above" does not contain [value, bound_type]');
          } {
            request.above = [ 1, 'closed' ];
            const { error } = fusion_protocol.query.validate(request);
            utils.check_error(error, '"value" must be an object');
          } {
            request.above = [ { }, 'open' ];
            const { error } = fusion_protocol.query.validate(request);
            utils.check_error(error, '"value" must have 1 child');
          } {
            request.above = [ { id: 4 }, 5 ];
            const { error } = fusion_protocol.query.validate(request);
            utils.check_error(error, '"bound_type" must be a string');
          } {
            request.above = [ { id: 3 }, 'ajar' ];
            const { error } = fusion_protocol.query.validate(request);
            utils.check_error(error, '"bound_type" must be one of [open, closed]');
          }
        });

        it('"below" without "order"', () => {
          const request = extend({ }, valid);
          request.below = [ { id: 1 }, 'open' ];
          const { value, error } = fusion_protocol.query.validate(request);
          assert.ifError(error);
          assert.deepStrictEqual(value, request);
        });

        it('wrong "below" type', () => {
          const request = extend({ }, valid);
          request.order = [ [ 'id' ], 'ascending' ];
          request.below = true;
          const { error } = fusion_protocol.query.validate(request);
          utils.check_error(error, '"below" must be an array');
        });

        it('wrong "below" value', () => {
          const request = extend({ }, valid);
          request.order = [ [ 'id' ], 'ascending' ];
          {
            request.below = [ ];
            const { error } = fusion_protocol.query.validate(request);
            utils.check_error(error, '"below" does not contain [value, bound_type]');
          } {
            request.below = [ 1, 'closed' ];
            const { error } = fusion_protocol.query.validate(request);
            utils.check_error(error, '"value" must be an object');
          } {
            request.below = [ { }, 'open' ];
            const { error } = fusion_protocol.query.validate(request);
            utils.check_error(error, '"value" must have 1 child');
          } {
            request.below = [ { id: 4 }, 5 ];
            const { error } = fusion_protocol.query.validate(request);
            utils.check_error(error, '"bound_type" must be a string');
          } {
            request.below = [ { id: 3 }, 'ajar' ];
            const { error } = fusion_protocol.query.validate(request);
            utils.check_error(error, '"bound_type" must be one of [open, closed]');
          }
        });

        it('wrong "limit" type', () => {
          const request = extend({ }, valid);
          request.limit = true;
          const { error } = fusion_protocol.query.validate(request);
          utils.check_error(error, '"limit" must be a number');
        });

        it('wrong "limit" value', () => {
          const request = extend({ }, valid);
          request.limit = 0;
          const { error } = fusion_protocol.query.validate(request);
          utils.check_error(error, '"limit" must be a positive number');
        });
      });

      describe('find', () => {
        const valid = {
          collection: 'fusion',
          find: { score: 4 },
        };

        it('valid', () => {
          const { value, error } = fusion_protocol.query.validate(valid);
          assert.ifError(error);
          assert.deepStrictEqual(value, valid);
        });

        it('order', () => {
          const request = extend({ }, valid);
          request.order = [ [ 'id' ], 'ascending' ];
          const { error } = fusion_protocol.query.validate(request);
          utils.check_error(error, '"order" is not allowed');
        });

        it('above', () => {
          const request = extend({ }, valid);
          request.above = [ { id: 3 }, 'open' ];
          const { error } = fusion_protocol.query.validate(request);
          utils.check_error(error, '"above" is not allowed');
        });

        it('below', () => {
          const request = extend({ }, valid);
          request.below = [ { id: 4 }, 'closed' ];
          const { error } = fusion_protocol.query.validate(request);
          utils.check_error(error, '"below" is not allowed');
        });

        it('limit', () => {
          const request = extend({ }, valid);
          request.limit = 4;
          const { error } = fusion_protocol.query.validate(request);
          utils.check_error(error, '"limit" is not allowed');
        });

        it('wrong "find" type', () => {
          const request = extend({ }, valid);
          request.find = 'score';
          const { error } = fusion_protocol.query.validate(request);
          utils.check_error(error, '"find" must be an object');
        });
      });

      describe('find_all multiple', () => {
        const valid = {
          collection: 'fusion',
          find_all: [ { score: 2 }, { score: 5, id: 0 } ],
        };

        it('valid', () => {
          const { value, error } = fusion_protocol.query.validate(valid);
          assert.ifError(error);
          assert.deepStrictEqual(value, valid);
        });

        it('order', () => {
          const request = extend({ }, valid);
          request.order = [ [ 'id' ], 'descending' ];
          const { error } = fusion_protocol.query.validate(request);
          utils.check_error(error, '"order" is not allowed');
        });

        it('limit', () => {
          const request = extend({ }, valid);
          request.limit = 2;
          const { value, error } = fusion_protocol.query.validate(request);
          assert.ifError(error);
          assert.deepStrictEqual(value, request);
        });

        it('above', () => {
          const request = extend({ }, valid);
          {
            request.above = [ { id: 3 }, 'closed' ];
            const { error } = fusion_protocol.query.validate(request);
            utils.check_error(error, '"above" is not allowed');
          } {
            request.order = [ [ 'id' ], 'ascending' ];
            const { error } = fusion_protocol.query.validate(request);
            utils.check_error(error, '"order" is not allowed');
          }
        });

        it('below', () => {
          const request = extend({ }, valid);
          {
            request.below = [ { id: 9 }, 'closed' ];
            const { error } = fusion_protocol.query.validate(request);
            utils.check_error(error, '"below" is not allowed');
          } {
            request.order = [ [ 'id' ], 'descending' ];
            const { error } = fusion_protocol.query.validate(request);
            utils.check_error(error, '"order" is not allowed');
          }
        });
      });

      describe('find_all one', () => {
        const valid = {
          collection: 'fusion',
          find_all: [ { score: 8, id: 5 } ],
        };

        it('valid', () => {
          const { value, error } = fusion_protocol.query.validate(valid);
          assert.ifError(error);
          assert.deepStrictEqual(value, valid);
        });

        it('order', () => {
          const request = extend({ }, valid);
          request.order = [ [ 'id' ], 'descending' ];
          const { value, error } = fusion_protocol.query.validate(request);
          assert.ifError(error);
          assert.deepStrictEqual(value, request);
        });

        it('limit', () => {
          const request = extend({ }, valid);
          request.limit = 2;
          const { value, error } = fusion_protocol.query.validate(request);
          assert.ifError(error);
          assert.deepStrictEqual(value, request);
        });

        it('above', () => {
          const request = extend({ }, valid);
          request.order = [ [ 'id' ], 'ascending' ];
          request.above = [ { id: 3 }, 'closed' ];
          const { value, error } = fusion_protocol.query.validate(request);
          assert.ifError(error);
          assert.deepStrictEqual(value, request);
        });

        it('below', () => {
          const request = extend({ }, valid);
          request.order = [ [ 'id' ], 'descending' ];
          request.below = [ { id: 9 }, 'closed' ];
          const { value, error } = fusion_protocol.query.validate(request);
          assert.ifError(error);
          assert.deepStrictEqual(value, request);
        });

        it('above and below and limit', () => {
          const request = extend({ }, valid);
          request.order = [ [ 'id' ], 'descending' ];
          request.above = [ { id: 'foo' }, 'open' ];
          request.below = [ { id: 'bar' }, 'closed' ];
          request.limit = 59;
          const { value, error } = fusion_protocol.query.validate(request);
          assert.ifError(error);
          assert.deepStrictEqual(value, request);
        });

        // TODO: these two tests are not passing because we don't enforce this
        // in the schema - figure out a way to enforce this, or move these
        // test cases to the server tests.
        it('"above" field not in "order"', () => {
          const request = extend({ }, valid);
          request.order = [ [ 'id' ], 'descending' ];
          request.above = [ { x: 'foo' }, 'open' ];
          const { error } = fusion_protocol.query.validate(request);
          assert.ifError(error);
          utils.check_error(error, 'TODO');
        });

        it('"below" field not in "order"', () => {
          const request = extend({ }, valid);
          request.order = [ [ 'id' ], 'descending' ];
          request.below = [ { x: 'foo' }, 'open' ];
          const { error } = fusion_protocol.query.validate(request);
          assert.ifError(error);
          utils.check_error(error, 'TODO');
        });

        it('wrong "find_all" type', () => {
          const request = extend({ }, valid);
          request.find_all = null;
          const { error } = fusion_protocol.query.validate(request);
          utils.check_error(error, '"find_all" must be an array');
        });

        it('wrong "find_all" value', () => {
          const request = extend({ }, valid);
          {
            request.find_all = [ ];
            const { error } = fusion_protocol.query.validate(request);
            utils.check_error(error, '"find_all" must contain at least 1 items');
          } {
            request.find_all = [ { } ];
            const { error } = fusion_protocol.query.validate(request);
            utils.check_error(error, '"item" must have at least 1 child');
          }
        });

        it('with "find"', () => {
          const request = extend({ }, valid);
          request.find = { id: 7 };
          const { error } = fusion_protocol.query.validate(request);
          utils.check_error(error, '"find" is not allowed'); // TODO: better message?
        });
      });
    });
  });
});
