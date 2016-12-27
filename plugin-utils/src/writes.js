'use strict';

const {reqlOptions, isObject} = require('./common');

const assert = require('assert');

const hzv = '$hz_v$';

// Common functionality used by write requests
const invalidatedMsg = 'Write invalidated by another request, try again.';
const missingMsg = 'The document was missing.';
const timeoutMsg = 'Operation timed out.';
const unauthorizedMsg = 'Operation not permitted.';

function applyVersion(r, row, newVersion) {
  return row.merge(r.object(hzv, newVersion));
}

// Note, most of this bullshit is to maintain compatibility with pre-3.0, where
// each item in a write batch was emitted as a separate value, rather than emitting
// a single array.
function makeResponse(data) {
  const makePatch = (val, index) => {
    if (index === 0) {
      return {op: 'replace', path: '', value: {type: 'value', synced: true, val}};
    } else {
      return {op: 'replace', path: '/val', value: val};
    }
  };

  return data.map((item, index) => {
    if (item instanceof Error) {
      return makePatch({error: item.message}, index);
    } else {
      return makePatch(item, index);
    }
  });
}

// This function returns a Promise that resolves to an array of responses -
//   one for each row in `originalRows`, or rejects with an appropriate error.
// deadline -> a Date object for when to give up retrying,
//   or a falsey value for no timeout
// preValidate -> function (rows):
//   rows: all pending rows
//   return: an array or the promise of an array of info for those rows
//           (which will be passed to the validate callback)
// validateRow -> function (validator, row, info):
//   validator: The function to validate with
//   row: The row from the original query
//   info: The info returned by the preValidate step for this row
//   return: nothing if successful or an error to be put as the response for this row
// doWrite -> function (rows):
//   rows: all pending rows
//   return: a (promise of a) ReQL write result object
function retryLoop(originalRows,
                   permissions,
                   deadline,
                   preValidate,
                   validateRow,
                   doWrite) {
  let isBatch;
  let firstAttempt = true;
  const iterate = (rowDataArg, responseData) => {
    let rowData = rowDataArg;
    if (rowData.length === 0) {
      return Promise.resolve(responseData);
    } else if (!firstAttempt && deadline) {
      if (Date.now() > deadline.getTime()) {
        responseData.forEach((data, index) => {
          if (data === null) {
            responseData[index] = new Error(timeoutMsg);
          }
        });
        return Promise.resolve(responseData);
      }
    }

    return Promise.resolve().then(() => {
      // The validate callback may clobber the original version field in the row,
      // so we have to restore it to the original value.
      // This is done because validation only approves moving from one specific
      // version of the row to another.  Even if the original request did not choose
      // the version, we are locked in to the version fetched from the preValidate
      // callback until the next iteration.  If the version has changed in the meantime,
      // it is an invalidated error which may be retried until we hit the deadline.
      rowData.forEach((data) => {
        if (data.version === undefined) {
          delete data.row[hzv];
        } else {
          data.row[hzv] = data.version;
        }
      });

      // If permissions returns a function, we need to use it to validate
      if (permissions()) {
        // For the set of rows to write, gather info for the validation step
        return Promise.resolve(preValidate(rowData.map((data) => data.row)))
        .then((infos) => {
          assert(infos.length === rowData.length);

          // For each row to write (and info), validate it with permissions
          const validator = permissions();
          if (validator) {
            const validRows = [];
            rowData.forEach((data, i) => {
              const res = validateRow(validator, data.row, infos[i]);

              if (res !== undefined) {
                responseData[data.index] = res;
              } else {
                validRows.push(data);
              }
            });
            rowData = validRows;
          }
        });
      }
    }).then(() => { // For the set of valid rows, call the write step
      if (rowData.length === 0) {
        return [];
      }
      return doWrite(rowData.map((data) => data.row)).then((res) => res.changes);
    }).then((changes) => {
      assert(changes.length === rowData.length);

      // Remove successful writes and invalidated writes that had an initial version
      const retryRows = [];
      rowData.forEach((data, index) => {
        const res = changes[index];
        if (res.error !== undefined) {
          if (res.error.indexOf('Duplicate primary key') === 0) {
            responseData[data.index] = new Error('The document already exists.');
          } else if (res.error.indexOf(invalidatedMsg) === 0 &&
                     data.version === undefined) {
            retryRows.push(data);
          } else {
            responseData[data.index] = new Error(res.error);
          }
        } else if (res.new_val === null) {
          responseData[data.index] = {id: res.old_val.id, [hzv]: res.old_val[hzv]};
        } else {
          responseData[data.index] = {id: res.new_val.id, [hzv]: res.new_val[hzv]};
        }
      });

      // Recurse, after which it will decide if there is more work to be done
      firstAttempt = false;
      return iterate(retryRows, responseData);
    });
  };

  return Promise.resolve().then(() => {
    // Original rows must be an array of one object or one array of objects
    // TODO: would be nice to make this just an array of objects, but would like
    // to preserve backwards compatibility with the client side
    if (!Array.isArray(originalRows) || originalRows.length !== 1) {
      throw new Error('Writes must be given a single object or an array of objects.');
    }

    isBatch = Array.isArray(originalRows[0]);
    const normalizedRows = isBatch ? originalRows[0] : [originalRows[0]];
    const responseData = normalizedRows.map((row) =>
      (isObject(row) ? null : new Error('Row to be written must be an object.')));

    // Filter out invalid rows
    const rowsToWrite = normalizedRows.reduce((acc, row, index) =>
      acc.concat(isObject(row) ? {row, index, version: row[hzv]} : [])
    , []);

    return iterate(rowsToWrite, responseData);
  }).then((data) => {
    // Compatibility - errored non-batch writes aren't emitted normally
    if (!isBatch && (data[0] instanceof Error)) {
      throw data[0];
    }
    return makeResponse(data);
  });
}

function validateOldRowOptional(validator, original, oldRow, newRow) {
  const expectedVersion = original[hzv];
  if (expectedVersion !== undefined &&
      (!oldRow || expectedVersion !== oldRow[hzv])) {
    return new Error(invalidatedMsg);
  } else if (!validator(oldRow, newRow)) {
    return new Error(unauthorizedMsg);
  }

  if (oldRow) {
    const oldVersion = oldRow[hzv];
    if (expectedVersion === undefined) {
      original[hzv] = oldVersion === undefined ? -1 : oldVersion;
    }
  }
}

function validateOldRowRequired(validator, original, oldRow, newRow) {
  if (oldRow == null) {
    return new Error(missingMsg);
  }

  const oldVersion = oldRow[hzv];
  const expectedVersion = original[hzv];
  if (expectedVersion !== undefined &&
      expectedVersion !== oldVersion) {
    return new Error(invalidatedMsg);
  } else if (!validator(oldRow, newRow)) {
    return new Error(unauthorizedMsg);
  }

  if (expectedVersion === undefined) {
    original[hzv] = oldVersion === undefined ? -1 : oldVersion;
  }
}

// Since we provide both `remove` and `removeAll`, make this common
function removeCommon(data, req, context) {
  const r = context.horizon.r;
  const timeout = req.getParameter('timeout');
  const collection = req.getParameter('collection');
  const permissions = req.getParameter('hz_permissions');

  if (!collection) {
    throw new Error('No collection given for remove operation.');
  } else if (!permissions) {
    throw new Error('No permissions given for remove operation.');
  }

  return retryLoop(data, permissions, timeout,
    (rows) => // pre-validation, all rows
      r.expr(rows.map((row) => row.id))
        .map((id) => collection.table.get(id))
        .run(context.horizon.conn(), reqlOptions),
    (validator, row, info) =>
      validateOldRowRequired(validator, row, info, null),
    (rows) => // write to database, all valid rows
      r.expr(rows).do((rowData) =>
        rowData.forEach((info) =>
          collection.table.get(info('id')).replace((row) =>
              r.branch(// The row may have been deleted between the get and now
                       row.eq(null),
                       null,

                       // The row may have been changed between the get and now
                       r.and(info.hasFields(hzv),
                             row(hzv).default(-1).ne(info(hzv))),
                       r.error(invalidatedMsg),

                       // Otherwise, we can safely remove the row
                       null),

              {returnChanges: 'always'}))
          // Pretend like we deleted rows that didn't exist
          .do((writeRes) =>
            writeRes.merge({changes:
              r.range(rowData.count()).map((index) =>
                r.branch(writeRes('changes')(index)('old_val').eq(null),
                         writeRes('changes')(index).merge(
                           // eslint-disable-next-line camelcase
                           {old_val: {id: rowData(index)('id')}}),
                         writeRes('changes')(index))).coerceTo('array'),
            })))
        .run(context.horizon.conn(), reqlOptions)
  );
}

module.exports = {
  invalidatedMsg,
  missingMsg,
  timeoutMsg,
  unauthorizedMsg,
  applyVersion,
  retryLoop,
  validateOldRowRequired,
  validateOldRowOptional,
  removeCommon,
  versionField: hzv,
};
