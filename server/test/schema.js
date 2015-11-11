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

  const write_without_id = {
    collection: 'fusion',
    data: [ { field: 4 } ],
  };

  it('protocol - insert without id', () => {
    var { error } = fusion_protocol.insert.validate(write_without_id);
    assert.ifError(error);
  });

  it('protocol - upsert without id', () => {
    var { error } = fusion_protocol.upsert.validate(write_without_id);
    assert.ifError(error);
  });

  it('protocol - store without id', () => {
    var { error } = fusion_protocol.store.validate(write_without_id);
    assert.ifError(error);
  });

  it('protocol - replace without id', () => {
    var { error } = fusion_protocol.replace.validate(write_without_id);
    utils.check_error(error, '"id" is required');
  });

  it('protocol - update without id', () => {
    var { error } = fusion_protocol.update.validate(write_without_id);
    utils.check_error(error, '"id" is required');
  });

  it('protocol - remove without id', () => {
    var { error } = fusion_protocol.remove.validate(write_without_id);
    utils.check_error(error, '"id" is required');
  });

  const write_with_id = {
    collection: 'fusion',
    data: [ { id: 5, field: 4 } ],
  };

  it('protocol - insert with id', () => {
    var { error } = fusion_protocol.insert.validate(write_with_id);
    assert.ifError(error);
  });

  it('protocol - upsert with id', () => {
    var { error } = fusion_protocol.upsert.validate(write_with_id);
    assert.ifError(error);
  });

  it('protocol - store with id', () => {
    var { error } = fusion_protocol.store.validate(write_with_id);
    assert.ifError(error);
  });

  it('protocol - replace with id', () => {
    var { error } = fusion_protocol.replace.validate(write_with_id);
    assert.ifError(error);
  });

  it('protocol - update with id', () => {
    var { error } = fusion_protocol.update.validate(write_with_id);
    assert.ifError(error);
  });

  it('protocol - remove with id', () => {
    var { error } = fusion_protocol.remove.validate(write_with_id);
    assert.ifError(error);
  });

});
