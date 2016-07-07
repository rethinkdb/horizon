'use strict';

const check = require('../error').check;

const r = require('rethinkdb');

// Common functionality used by write requests

const invalidated_msg = 'Write invalidated by another request, try again.';
const missing_msg = 'The document was missing.';
const timeout_msg = 'Operation timed out.';
const unauthorized_msg = 'Operation not permitted.';

const version_field = '$hz_v$';
const apply_version = (row, new_version) => row.merge(r.object(version_field, new_version));

const make_write_response = (data) => {
  data.forEach((item, index) => {
    if (item instanceof Error) {
      data[index] = { error: item.message };
    }
  });
  return { data, state: 'complete' };
};

// This function returns a Promise that resolves to an array of responses - one for each row in
//  `original_rows`, or rejects with an appropriate error.
// pre_validate -> function (rows):
//   rows: all pending rows
//   return: a (promise of an) array of info for those rows (which will be passed to the validate step)
// validate_row -> function (row, info):
//   row: The row from the original query
//   info: The info returned by the pre_validate step for this row
//   return: nothing if successful or an error to be put as the response for this row
// do_write -> function (rows):
//   rows: all pending rows
//   return: a (promise of a) ReQL write result object
const retry_loop = (original_rows, ruleset, timeout, pre_validate, validate_row, do_write) => {
  const response_data = Array(original_rows.length).fill(null);

  // Save original version fields, which may get clobbered, so we don't have to copy everything
  let row_data = original_rows.map((row, index) => ({ row, index, version: row[version_field] }));
  let deadline;

  const iterate = () => {
    if (row_data.length === 0) {
      return response_data;
    } else if (!deadline) {
      deadline = Date.now() + timeout;
    } else if (Date.now() > deadline) {
      response_data.forEach((data, index) => {
        if (data === null) {
          response_data[index] = new Error(timeout_msg);
        }
      });
      return response_data;
    }

    return Promise.resolve().then(() => {
      // Gather all rows to write
      row_data.forEach((data) => {
        if (data.version === undefined) {
          delete data.row[version_field];
        } else {
          data.row[version_field] = data.version;
        }
      });

      if (ruleset.validation_required()) {
        // For the set of rows to write, gather info for the validation step
        return pre_validate(row_data.map((data) => data.row)).then((infos) => {
          check(infos.length === row_data.length);

          // For each row to write (and info), validate it with permissions
          const valid_rows = [ ];
          row_data.forEach((data, i) => {
            const res = validate_row(data.row, infos[i]);

            if (res !== undefined) {
              response_data[data.index] = res;
            } else {
              valid_rows.push(data);
            }
          });
          row_data = valid_rows;
        });
      }
    }).then(() => { // For the set of valid rows, call the write step
      if (row_data.length === 0) {
        return [ ];
      }
      return do_write(row_data.map((data) => data.row)).then((res) => res.changes);
    }).then((changes) => {
      check(changes.length === row_data.length);

      // Remove successful writes and invalidated writes that had an initial version
      const retry_rows = [ ];
      row_data.forEach((data, index) => {
        const res = changes[index];
        if (res.error !== undefined) {
          if (res.error.indexOf('Duplicate primary key') === 0) {
            response_data[data.index] = { error: 'The document already exists.' };
          } else if (res.error.indexOf(invalidated_msg) === 0 &&
                     data.version !== undefined) {
            retry_rows.push(data);
          } else {
            response_data[data.index] = { error: res.error };
          }
        } else if (res.new_val === null) {
          response_data[data.index] = { id: res.old_val.id, [version_field]: res.old_val[version_field] };
        } else {
          response_data[data.index] = { id: res.new_val.id, [version_field]: res.new_val[version_field] };
        }
      });

      row_data = retry_rows;

      // Recurse, after which it will decide if there is more work to be done
      return iterate();
    });
  };

  return iterate().then(make_write_response);
};

module.exports = {
  invalidated_msg,
  missing_msg,
  timeout_msg,
  unauthorized_msg,
  make_write_response,
  version_field,
  apply_version,
  retry_loop,
};
