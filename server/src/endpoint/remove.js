'use strict';

const remove = require('../schema/horizon_protocol').remove;
const reql_options = require('./common').reql_options;
const writes = require('./writes');

const Joi = require('joi');
const r = require('rethinkdb');

const run = (raw_request, context, ruleset, metadata, send, done) => {
  const parsed = Joi.validate(raw_request.options, remove);
  if (parsed.error !== null) { throw new Error(parsed.error.details[0].message); }

  const collection = metadata.collection(parsed.value.collection);
  const conn = metadata.connection();

  writes.retry_loop(parsed.value.data, ruleset, parsed.value.timeout,
    (rows) => // pre-validation, all rows
      r.expr(rows.map((row) => row.id))
        .map((id) => collection.table.get(id))
        .run(conn, reql_options),
    (row, info) => { // validation, each row
      if (info === null) {
        return { id: row.id }; // Just pretend we deleted it
      }

      const old_version = info[writes.version_field];
      const expected_version = row[writes.version_field];
      if (expected_version !== undefined &&
          expected_version !== old_version) {
        return new Error(writes.invalidated_msg);
      } else if (!ruleset.validate(context, info, null)) {
        return new Error(writes.unauthorized_msg);
      }

      if (row[writes.version_field] === undefined) {
        row[writes.version_field] =
          old_version === undefined ? -1 : old_version;
      }
    },
    (rows) => // write to database, all valid rows
      r.expr(rows).do((row_data) =>
        row_data.forEach((info) =>
          collection.table.get(info('id')).replace((row) =>
              r.branch(// The row may have been deleted between the get and now
                       row.eq(null),
                       null,

                       // The row may have been changed between the get and now
                       r.and(info.hasFields(writes.version_field),
                             row(writes.version_field).default(-1).ne(info(writes.version_field))),
                       r.error(writes.invalidated_msg),

                       // Otherwise, we can safely remove the row
                       null),

              { returnChanges: 'always' }))
          // Pretend like we deleted rows that didn't exist
          .do((res) =>
            res.merge({ changes:
              r.range(row_data.count()).map((index) =>
                r.branch(res('changes')(index)('old_val').eq(null),
                         res('changes')(index).merge({ old_val: { id: row_data(index)('id') } }),
                         res('changes')(index))).coerceTo('array'),
            })))
        .run(conn, reql_options)
  ).then(done).catch(done);
};

module.exports = { run };
