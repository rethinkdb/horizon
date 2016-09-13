'use strict';

const assert = require('assert');

const {r} = require('@horizon/server');

const hz_v = '$hz_v$';

// Common functionality used by write requests
const invalidated_msg = 'Write invalidated by another request, try again.';
const missing_msg = 'The document was missing.';
const timeout_msg = 'Operation timed out.';
const unauthorized_msg = 'Operation not permitted.';

function apply_version(row, new_version) {
  return row.merge(r.object(hz_v, new_version));
}

function make_write_response(data) {
  data.forEach((item, index) => {
    if (item instanceof Error) {
      data[index] = {error: item.message};
    }
  });
  return data;
}

// This function returns a Promise that resolves to an array of responses -
//   one for each row in `original_rows`, or rejects with an appropriate error.
// deadline -> a Date object for when to give up retrying,
//   or a falsey value for no timeout
// pre_validate -> function (rows):
//   rows: all pending rows
//   return: an array or the promise of an array of info for those rows
//           (which will be passed to the validate callback)
// validate_row -> function (row, info):
//   validator: The function to validate with
//   row: The row from the original query
//   info: The info returned by the pre_validate step for this row
//   return: nothing if successful or an error to be put as the response for this row
// do_write -> function (rows):
//   rows: all pending rows
//   return: a (promise of a) ReQL write result object
function retry_loop(original_rows,
                    permissions,
                    deadline,
                    pre_validate,
                    validate_row,
                    do_write) {
  let first_attempt = true;
  const iterate = (row_data_arg, response_data) => {
    let row_data = row_data_arg;
    if (row_data.length === 0) {
      return response_data;
    } else if (!first_attempt && deadline) {
      if (Date.now() > deadline.getTime()) {
        response_data.forEach((data, index) => {
          if (data === null) {
            response_data[index] = new Error(timeout_msg);
          }
        });
        return response_data;
      }
    }

    return Promise.resolve().then(() => {
      // The validate callback may clobber the original version field in the row,
      // so we have to restore it to the original value.
      // This is done because validation only approves moving from one specific
      // version of the row to another.  Even if the original request did not choose
      // the version, we are locked in to the version fetched from the pre_validate
      // callback until the next iteration.  If the version has changed in the meantime,
      // it is an invalidated error which may be retried until we hit the deadline.
      row_data.forEach((data) => {
        if (data.version === undefined) {
          delete data.row[hz_v];
        } else {
          data.row[hz_v] = data.version;
        }
      });

      // If permissions returns a function, we need to use it to validate
      if (permissions()) {
        // For the set of rows to write, gather info for the validation step
        return Promise.resolve(pre_validate(row_data.map((data) => data.row)))
        .then((infos) => {
          assert(infos.length === row_data.length);

          // For each row to write (and info), validate it with permissions
          const validator = permissions();
          if (validator) {
            const valid_rows = [];
            row_data.forEach((data, i) => {
              const res = validate_row(validator, data.row, infos[i]);

              if (res !== undefined) {
                response_data[data.index] = res;
              } else {
                valid_rows.push(data);
              }
            });
            row_data = valid_rows;
          }
        });
      }
    }).then(() => { // For the set of valid rows, call the write step
      if (row_data.length === 0) {
        return [];
      }
      return do_write(row_data.map((data) => data.row)).then((res) => res.changes);
    }).then((changes) => {
      assert(changes.length === row_data.length);

      // Remove successful writes and invalidated writes that had an initial version
      const retry_rows = [];
      row_data.forEach((data, index) => {
        const res = changes[index];
        if (res.error !== undefined) {
          if (res.error.indexOf('Duplicate primary key') === 0) {
            response_data[data.index] = {error: 'The document already exists.'};
          } else if (res.error.indexOf(invalidated_msg) === 0 &&
                     data.version === undefined) {
            retry_rows.push(data);
          } else {
            response_data[data.index] = {error: res.error};
          }
        } else if (res.new_val === null) {
          response_data[data.index] = {id: res.old_val.id, [hz_v]: res.old_val[hz_v]};
        } else {
          response_data[data.index] = {id: res.new_val.id, [hz_v]: res.new_val[hz_v]};
        }
      });

      // Recurse, after which it will decide if there is more work to be done
      first_attempt = false;
      return iterate(retry_rows, response_data, deadline);
    });
  };

  return iterate(original_rows.map((row, index) => ({row, index, version: row[hz_v]})),
                 Array(original_rows.length).fill(null))
    .then(make_write_response);
}

function validate_old_row_optional(validator, original, old_row, new_row) {
  const expected_version = original[hz_v];
  if (expected_version !== undefined &&
      (!old_row || expected_version !== old_row[hz_v])) {
    return new Error(invalidated_msg);
  } else if (!validator(old_row, new_row)) {
    return new Error(unauthorized_msg);
  }

  if (old_row) {
    const old_version = old_row[hz_v];
    if (expected_version === undefined) {
      original[hz_v] = old_version === undefined ? -1 : old_version;
    }
  }
}

function validate_old_row_required(validator, original, old_row, new_row) {
  if (old_row == null) {
    return new Error(missing_msg);
  }

  const old_version = old_row[hz_v];
  const expected_version = original[hz_v];
  if (expected_version !== undefined &&
      expected_version !== old_version) {
    return new Error(invalidated_msg);
  } else if (!validator(old_row, new_row)) {
    return new Error(unauthorized_msg);
  }

  if (expected_version === undefined) {
    original[hz_v] = old_version === undefined ? -1 : old_version;
  }
}

module.exports = {
  invalidated_msg,
  missing_msg,
  timeout_msg,
  unauthorized_msg,
  apply_version,
  retry_loop,
  validate_old_row_required,
  validate_old_row_optional,
  versionField: hz_v,
};
