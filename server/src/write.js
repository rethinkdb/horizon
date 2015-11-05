'use strict';

const error = require('./error.js');
const r = require('rethinkdb');

var check = error.check;
var fail = error.fail;

module.exports.make_write_reql = function (request) {
  var type = request.type;
  var options = request.options;
  var collection = options.collection;
  var data = options.data;

  check(data !== undefined, `'options.data' must be specified.`);
  check(collection !== undefined, `'options.collection' must be specified.`);
  check(collection.constructor.name === 'String',
        `'options.collection' must be a string.`)

  var reql = r.table(collection);

  if (type === 'store_update') {
    reql = reql.insert(data, { conflict: 'update', returnChanges: true });
  } else if (type === 'store_replace') {
    reql = reql.insert(data, { conflict: 'replace', returnChanges: true });
  } else if (type === 'store_error') {
    reql = reql.insert(data, { conflict: 'error', returnChanges: true });
  } else {
    check(data.id !== undefined, `'options.data.id' must be specified for 'remove'.`);
    reql = reql.get(data.id).delete({ returnChanges: true });
  }

  return reql;
};

module.exports.handle_write_response = function (client, request, response, send_cb) {
  console.log(`Handling write response.`);
  if (response.errors !== 0) {
    send_cb({ error: response.first_error });
  } else if (response.changes.length === 1) {
    send_cb({ data: response.changes, state: 'complete' });
  } else if (response.unchanged === 1) {
    send_cb({ data: [ { old_val: request.data, new_val: request.data } ], state: 'complete' });
  } else if (response.skipped === 1) {
    send_cb({ data: [ { old_val: null, new_val: null } ], state: 'complete' });
  } else {
    fail(`Unexpected response counts: ${JSON.stringify(response)}`);
  }
};
