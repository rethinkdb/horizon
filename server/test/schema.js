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
          field_name: 'id',
        };

        it('valid', () => {
          const { value, error } = fusion_protocol.query.validate(valid);
          assert.ifError(error);
          assert.deepStrictEqual(value, valid);
        });

        it('required fields', () => {
          test_required_fields(fusion_protocol.query, valid,
                               [ 'collection', 'field_name' ]);
        });

        it('extra field', () => {
          test_extra_field(fusion_protocol.query, valid);
        });

        it('order', () => {
          const request = extend({ }, valid);
          request.order = 'ascending';
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

        it('wrong "collection" type', () => {
          const request = extend({ }, valid);
          request.collection = null;
          const { error } = fusion_protocol.query.validate(request);
          utils.check_error(error, '"collection" must be a string');
        });

        // TODO: add this to the write schema tests
        it('wrong "collection" value', () => {
          const request = extend({ }, valid);
          request.collection = '*.*';
          const { error } = fusion_protocol.query.validate(request);
          utils.check_error(error, '"collection" must only contain alpha-numeric and underscore characters');
        });

        it('wrong "field_name" type', () => {
          const request = extend({ }, valid);
          request.field_name = 5;
          const { error } = fusion_protocol.query.validate(request);
          utils.check_error(error, '"field_name" must be a string');
        });

        it('wrong "order" type', () => {
          const request = extend({ }, valid);
          request.order = { };
          const { error } = fusion_protocol.query.validate(request);
          utils.check_error(error, '"order" must be a string');
        });

        it('wrong "order" value', () => {
          const request = extend({ }, valid);
          request.order = 'baleeted';
          const { error } = fusion_protocol.query.validate(request);
          utils.check_error(error, '"order" must be one of [ascending, descending]');
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
          field_name: 'id',
          selection: {
            type: 'find',
            args: [ 4 ],
          },
        };

        it('valid', () => {
          const { value, error } = fusion_protocol.query.validate(valid);
          assert.ifError(error);
          assert.deepStrictEqual(value, valid);
        });

        it('order', () => {
          const request = extend({ }, valid);
          request.order = 'ascending';
          const { error } = fusion_protocol.query.validate(request);
          utils.check_error(error, '"order" is not allowed');
        });

        it('limit', () => {
          const request = extend({ }, valid);
          request.limit = 4;
          const { error } = fusion_protocol.query.validate(request);
          utils.check_error(error, '"limit" is not allowed');
        });

        it('extra selection field', () => {
          const request = extend({ }, valid);
          request.selection = { type: 'find', args: [ 0 ], fake_field: 'a' };
          const { error } = fusion_protocol.query.validate(request);
          utils.check_error(error, '"fake_field" is not allowed');
        });

        it('wrong "args" count', () => {
          const request = extend({ }, valid);
          request.selection = { type: 'find', args: [ 1, 2 ] };
          const { error } = fusion_protocol.query.validate(request);
          utils.check_error(error, '"args" must contain 1 items');
        });
      });

      describe('find_all', () => {
        const valid = {
          collection: 'fusion',
          field_name: 'id',
          selection: {
            type: 'find_all',
            args: [ 4, 5, 6 ],
          },
        };

        it('valid', () => {
          const { value, error } = fusion_protocol.query.validate(valid);
          assert.ifError(error);
          assert.deepStrictEqual(value, valid);
        });

        it('order', () => {
          const request = extend({ }, valid);
          request.order = 'descending';
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

        it('extra selection field', () => {
          const request = extend({ }, valid);
          request.selection = { type: 'find_all', args: [ 0 ], fake_field: { } };
          const { error } = fusion_protocol.query.validate(request);
          utils.check_error(error, '"fake_field" is not allowed');
        });

        it('wrong "args" count', () => {
          const request = extend({ }, valid);
          request.selection = { type: 'find_all', args: [ ] };
          const { error } = fusion_protocol.query.validate(request);
          utils.check_error(error, '"args" must contain at least 1 items');
        });
      });

      describe('between', () => {
        const valid = {
          collection: 'fusion',
          field_name: 'id',
          selection: {
            type: 'between',
            args: [ 4, 5 ],
          },
        };

        it('valid', () => {
          const { value, error } = fusion_protocol.query.validate(valid);
          assert.ifError(error);
          assert.deepStrictEqual(value, valid);
        });

        it('order', () => {
          const request = extend({ }, valid);
          request.order = 'descending';
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

        it('extra selection field', () => {
          const request = extend({ }, valid);
          request.selection = { type: 'between', args: [ 1, 5 ], fake_field: false };
          const { error } = fusion_protocol.query.validate(request);
          utils.check_error(error, '"fake_field" is not allowed');
        });

        it('wrong "args" count', () => {
          const request = extend({ }, valid);
          request.selection = { type: 'between', args: [ 3, 4, 5 ] };
          const { error } = fusion_protocol.query.validate(request);
          utils.check_error(error, '"args" must contain 2 items');
        });
      });
    });
  });
});
