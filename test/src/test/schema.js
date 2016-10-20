'use strict';

const {request: requestSchema} = require('@horizon/server/src/schema');
const utils = require('./utils');

const assert = require('assert');

describe('Schema', () => {
  const test_required_fields = (schema, valid, fields) => {
    fields.forEach((f) => {
      const request = Object.assign({}, valid); // Create a shallow copy
      request[f] = undefined;
      const error = schema.validate(request).error;
      utils.check_error(error, `"${f}" is required`);
    });
  };

  const test_extra_field = (schema, valid) => {
    const request = Object.assign({}, valid); // Create a shallow copy
    request.fake_field = false;
    const error = schema.validate(request).error;
    utils.check_error(error, '"fake_field" is not allowed');
  };

  describe('Protocol', () => {
    describe('Request', () => {
      const valid = {
        requestId: 1,
        options: {query: []},
      };

      it('allows options', () => {
        const parsed = requestSchema.validate(valid);
        assert.ifError(parsed.error);
        assert.deepStrictEqual(parsed.value, valid);
      });

      it('allows keepalive', () => {
        const request = Object.assign({type: 'keepalive'}, valid);
        delete request.options;
        const parsed = requestSchema.validate(request);
        assert.ifError(parsed.error);
        assert.deepStrictEqual(parsed.value, request);
      });

      it('rejects keepalive with options', () => {
        const request = Object.assign({type: 'keepalive'}, valid);
        const error = requestSchema.validate(request).error;
        utils.check_error(error, '"options" is not allowed');
      });

      it('allows endRequest', () => {
        const request = Object.assign({type: 'endRequest'}, valid);
        delete request.options;
        const parsed = requestSchema.validate(request);
        assert.ifError(parsed.error);
        assert.deepStrictEqual(parsed.value, request);
      });

      it('rejects endRequest with options', () => {
        const request = Object.assign({type: 'endRequest'}, valid);
        const error = requestSchema.validate(request).error;
        utils.check_error(error, '"options" is not allowed');
      });

      it('requires fields', () => {
        test_required_fields(requestSchema, valid,
                             ['requestId', 'options']);
      });

      it('rejects wrong "requestId" type', () => {
        const request = Object.assign({}, valid);
        request.requestId = 'str';
        const error = requestSchema.validate(request).error;
        utils.check_error(error, '"requestId" must be a number');
      });

      it('rejects wrong "type" value', () => {
        const request = Object.assign({}, valid);
        request.type = 5;
        const error = requestSchema.validate(request).error;
        utils.check_error(error, '"type" must be one of');
      });

      it('rejects wrong "options" type', () => {
        const request = Object.assign({}, valid);
        request.options = [5, 6];
        const error = requestSchema.validate(request).error;
        utils.check_error(error, '"options" must be an object');
      });

      it('rejects unknown fields', () => {
        test_extra_field(requestSchema, valid);
      });
    });
  });
});
