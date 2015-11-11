'use strict';

const fusion_protocol = require('../src/schema/fusion_protocol');
const utils = require('./utils');

const assert = require('assert');

describe('Schema', () => {

  it('protocol - request', () => {
    const request = {
      request_id: 1,
      type: 'query',
      options: { },
    };

    var { error, value } = fusion_protocol.request.validate(request);

    assert.ifError(error);
    assert(value);
  });

  // TODO: all these tests assume failures but don't validate why

  it('protocol - read - find', () => {
    const options = {
      collection: 'fusion',
      field_name: 'id',
      selection: {
        type: 'find',
        args: [ 1, 2, 3 ],
      },
      limit: 1,
    };

    var { error } = fusion_protocol.query.validate(options);

    assert.ifError(error);
  });

  it('protocol - read - between', () => {
    const options = {
      collection: 'fusion',
      field_name: 'id',
      selection: {
        type: 'between',
        args: [ 1, 2 ],
      },
      limit: 1,
      order: 'descending',
    };

    var { error } = fusion_protocol.query.validate(options);

    assert.ifError(error);
  });

  it('protocol - read - find_one', () => {
    const options = {
      collection: 'fusion',
      field_name: 'id',
      selection: {
        type: 'find_one',
        args: [ 1 ],
      },
      limit: 1,
    };

    var { error } = fusion_protocol.query.validate(options);

    assert(error);
  });

  it('protocol - write no id', () => {
    const options = {
      collection: 'fusion',
      data: [ { field: 4 } ],
    };

    var { error } = fusion_protocol.insert.validate(options);
    assert.ifError(error);
    var { error } = fusion_protocol.upsert.validate(options);
    assert.ifError(error);
    var { error } = fusion_protocol.store.validate(options);
    assert.ifError(error);

    var { error } = fusion_protocol.replace.validate(options);
    utils.check_error(error, '"id" is required');
    var { error } = fusion_protocol.update.validate(options);
    utils.check_error(error, '"id" is required');
    var { error } = fusion_protocol.remove.validate(options);
    utils.check_error(error, '"id" is required');
  });

  it('protocol - write with id', () => {
    const options = {
      collection: 'fusion',
      data: [ { id: 5, field: 4 } ],
    };

    var { error } = fusion_protocol.insert.validate(options);
    assert.ifError(error);
    var { error } = fusion_protocol.upsert.validate(options);
    assert.ifError(error);
    var { error } = fusion_protocol.store.validate(options);
    assert.ifError(error);

    var { error } = fusion_protocol.replace.validate(options);
    assert.ifError(error);
    var { error } = fusion_protocol.update.validate(options);
    assert.ifError(error);
    var { error } = fusion_protocol.remove.validate(options);
    assert.ifError(error);
  });

});
