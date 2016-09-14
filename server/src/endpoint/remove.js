'use strict';

const remove = require('../schema/horizon_protocol').remove;
const reql_options = require('./common').reql_options;
const writes = require('./writes');
const hz_v = writes.version_field;

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
    (row, info) => writes.validate_old_row_required(context, row, info, null, ruleset),
    (rows) => // write to database, all valid rows
      r.expr(rows).do((row_data) =>
        row_data.forEach((info) =>
          collection.table.get(info('id')).replace((row) =>
              r.branch(// The row may have been deleted between the get and now
                       row.eq(null),
                       null,

                       // The row may have been changed between the get and now
                       r.and(info.hasFields(hz_v),
                             row(hz_v).default(-1).ne(info(hz_v))),
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
