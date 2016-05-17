'use strict';

const check = require('../error').check;
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
  const response_data = [ ];

  r.expr(parsed.value.data.map((row) => row.id))
    .map((id) => collection.table.get(id))
    .run(conn, reql_options)
    .then((old_rows) => {
      check(old_rows.length === parsed.value.data.length, 'Unexpected ReQL response size.');
      const valid_info = [ ];
      for (let i = 0; i < old_rows.length; ++i) {
        if (old_rows[i] === null) {
          // Just pretend we deleted it
          response_data.push({ id: parsed.value.data[i].id });
        } else if (!ruleset.validate(context, old_rows[i], null)) {
          response_data.push(new Error('Operation not permitted.'));
        } else {
          const info = { id: old_rows[i].id };
          info[writes.version_field] = old_rows[i][writes.version_field];
          valid_info.push(info);
          response_data.push(null);
        }
      }

      return r.expr(valid_info).do((rows) =>
               rows.forEach((info) =>
                 collection.table.get(info('id')).replace((row) =>
                     r.branch(// The row may have been deleted between the get and now
                              row.eq(null),
                              null,

                              // The row may have been changed between the get and now,
                              // which would require validation again.
                              row(writes.version_field).ne(info(writes.version_field)),
                              r.error(writes.invalidated_error),

                              // Otherwise, we can safely remove the row
                              null),

                     { returnChanges: 'always' }))
                 // Pretend like we deleted rows that didn't exist
                 .do((res) =>
                   res.merge({ changes:
                     r.range(rows.count()).map((index) =>
                       r.branch(res('changes')(index)('old_val').eq(null),
                                res('changes')(index).merge({ old_val: rows(index) }),
                                res('changes')(index))).coerceTo('array'),
                   })))
               .run(conn, reql_options);
    }).then((remove_results) => {
      done(writes.make_write_response(response_data, remove_results));
    }).catch(done);
};

module.exports = { run };
