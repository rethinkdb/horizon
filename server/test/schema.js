'use strict';

const fusion_protocol = require('../src/schema/fusion_protocol');

const assert = require('assert');

describe('Schema', () => {

  it('protocol - request', (done) => {
    const request = {
      request_id: 1,
      type: 'query',
      options: { },
    };

    var { error, value } = fusion_protocol.request.validate(request);

    assert.ifError(error);
    assert(value);

    done();
  });

  // TODO: all these tests assume failures but don't validate why

  it('protocol - read - find', (done) => {
    const options = {
      collection: 'fusion',
      field_name: 'id',
      selection: {
        type: 'find',
        args: [ 1, 2, 3 ]
      },
      limit: 1,
    };

    var { error } = fusion_protocol.query.validate(options);

    assert.ifError(error);

    done();
  });

  it('protocol - read - between', (done) => {
    const options = {
      collection: 'fusion',
      field_name: 'id',
      selection: {
        type: 'between',
        args: [ 1, 2 ]
      },
      limit: 1,
      order: 'descending',
    };

    var { error } = fusion_protocol.query.validate(options);

    assert.ifError(error);

    done();
  });

  it('protocol - read - find_one', (done) => {
    const options = {
      collection: 'fusion',
      field_name: 'id',
      selection: {
        type: 'find_one',
        args: [ 1 ]
      },
      limit: 1
    };

    var { error } = fusion_protocol.query.validate(options);

    assert(error);

    done();
  });

});
