'use strict';

const check = require('../error').check;

const r = require('rethinkdb');

// Common functionality used by write requests

const invalidated_error = 'Write invalidated by another request, try again.';
const missing_error = 'The document was missing.';
const unauthorized_error = 'Operation not permitted.';

const version_field = '$hz_v$';
const apply_version = (row, new_version) => row.merge(r.object(version_field, new_version));

const make_write_response = (data, results) => {
  let results_index = 0;
  for (let i = 0; i < data.length; ++i) {
    if (data[i] instanceof Error) {
      data[i] = { error: data[i].message };
    } else if (data[i] === null) {
      check(results.changes.length > results_index);
      const res = results.changes[results_index++];
      if (res.error !== undefined) {
        if (res.error.indexOf('Duplicate primary key') === 0) {
          data[i] = { error: 'The document already exists.' };
        } else {
          data[i] = { error: res.error };
        }
      } else if (res.new_val === null) {
        data[i] = { id: res.old_val.id };
        data[i][version_field] = res.old_val[version_field];
      } else {
        data[i] = { id: res.new_val.id };
        data[i][version_field] = res.new_val[version_field];
      }
    }
  }
  return { data, state: 'complete' };
};

module.exports = {
  invalidated_error,
  missing_error,
  unauthorized_error,
  make_write_response,
  version_field,
  apply_version,
};
