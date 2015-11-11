'use strict';

const assert = require('assert');
const protocol = require('../src/schema/protocol');

describe('Schema', () => {

  it('protocol - request', (done) => {
    const request = {
      request_id: 1,
      type: 'query',
      options: {}
    };

    var { error, value } = protocol.request.validate(request);

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

    var { error } = protocol.read.validate(options);

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

    var { error } = protocol.read.validate(options);

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

    var { error } = protocol.read.validate(options);

    assert(error);

    done();
  });

});
