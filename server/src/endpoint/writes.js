'use strict';

const check = require('../error').check;

const r = require('rethinkdb');

// Common functionality used by write requests

const invalidated_msg = 'Write invalidated by another request, try again.';
const missing_msg = 'The document was missing.';
const timeout_msg = 'Operation timed out.';
const unauthorized_msg = 'Operation not permitted.';

const hz_v = '$hz_v$';
const apply_version = (row, new_version) => row.merge(r.object(hz_v, new_version));

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
// timeout -> integer
//   minimum number of milliseconds before giving up on retrying writes
//   null means no timeout
// pre_validate -> function (rows):
//   rows: all pending rows
//   return: an array or the promise of an array of info for those rows
//           (which will be passed to the validate callback)
// validate_row -> function (row, info):
//   row: The row from the original query
//   info: The info returned by the pre_validate step for this row
//   return: nothing if successful or an error to be put as the response for this row
// do_write -> function (rows):
//   rows: all pending rows
//   return: a (promise of a) ReQL write result object
const retry_loop = (original_rows, ruleset, timeout, pre_validate, validate_row, do_write) => {
  const iterate = (row_data, response_data, deadline_optional) => {
    let deadline = deadline_optional;
    if (row_data.length === 0) {
      return response_data;
    } else if (timeout !== null) {
      if (!deadline) {
        deadline = Date.now() + timeout;
      } else if (Date.now() > deadline) {
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

      if (ruleset.validation_required()) {
        // For the set of rows to write, gather info for the validation step
        return Promise.resolve(pre_validate(row_data.map((data) => data.row))).then((infos) => {
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
                     data.version === undefined) {
            retry_rows.push(data);
          } else {
            response_data[data.index] = { error: res.error };
          }
        } else if (res.new_val === null) {
          response_data[data.index] = { id: res.old_val.id, [hz_v]: res.old_val[hz_v] };
        } else {
          response_data[data.index] = { id: res.new_val.id, [hz_v]: res.new_val[hz_v] };
        }
      });

      // Recurse, after which it will decide if there is more work to be done
      return iterate(retry_rows, response_data, deadline);
    });
  };

  return iterate(original_rows.map((row, index) => ({ row, index, version: row[hz_v] })),
                 Array(original_rows.length).fill(null),
                 null).then(make_write_response);
};

const validate_old_row_optional = (context, original, old_row, new_row, ruleset) => {
  const expected_version = original[hz_v];
  if (expected_version !== undefined &&
      (!old_row || expected_version !== old_row[hz_v])) {
    return new Error(invalidated_msg);
  } else if (!ruleset.validate(context, old_row, new_row)) {
    return new Error(unauthorized_msg);
  }

  if (old_row) {
    const old_version = old_row[hz_v];
    if (expected_version === undefined) {
      original[hz_v] = old_version === undefined ? -1 : old_version;
    }
  }
};

const validate_old_row_required = (context, original, old_row, new_row, ruleset) => {
  if (old_row === null) {
    return new Error(missing_msg);
  }

  const old_version = old_row[hz_v];
  const expected_version = original[hz_v];
  if (expected_version !== undefined &&
      expected_version !== old_version) {
    return new Error(invalidated_msg);
  } else if (!ruleset.validate(context, old_row, new_row)) {
    return new Error(unauthorized_msg);
  }

  if (expected_version === undefined) {
    original[hz_v] = old_version === undefined ? -1 : old_version;
  }
};

module.exports = {
  invalidated_msg,
  missing_msg,
  timeout_msg,
  unauthorized_msg,
  make_write_response,
  version_field: hz_v,
  apply_version,
  retry_loop,
  validate_old_row_required,
  validate_old_row_optional,
};
