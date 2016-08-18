'use strict';

const upsert = require('../schema/horizon_protocol').upsert;
const reql_options = require('./common').reql_options;
const writes = require('./writes');
const hz_v = writes.version_field;

const Joi = require('joi');
const r = require('rethinkdb');

const run = (raw_request, context, ruleset, metadata, send, done) => {
  const parsed = Joi.validate(raw_request.options, upsert);
  if (parsed.error !== null) { throw new Error(parsed.error.details[0].message); }

  const collection = metadata.collection(parsed.value.collection);
  const conn = metadata.connection();

  writes.retry_loop(parsed.value.data, ruleset, parsed.value.timeout,
    (rows) => // pre-validation, all rows
      r.expr(rows)
        .map((new_row) =>
          r.branch(new_row.hasFields('id'),
                   collection.table.get(new_row('id')).do((old_row) =>
                     r.branch(old_row.eq(null),
                              [ null, new_row ],
                              [ old_row, old_row.merge(new_row) ])),
                   [ null, new_row ]))
        .run(conn, reql_options),
    (row, info) => writes.validate_old_row_optional(context, row, info[0], info[1], ruleset),
    (rows) => // write to database, all valid rows
      r.expr(rows)
        .forEach((new_row) =>
          r.branch(new_row.hasFields('id'),
                   collection.table.get(new_row('id')).replace((old_row) =>
                       r.branch(
                         old_row.eq(null),
                         r.branch(
                           // Error if we were expecting the row to exist
                           new_row.hasFields(hz_v),
                           r.error(writes.invalidated_msg),

                           // Otherwise, insert the row
                           writes.apply_version(new_row, 0)
                         ),
                         r.branch(
                           // The row may have changed from the expected version
                           r.and(new_row.hasFields(hz_v),
                                 old_row(hz_v).default(-1).ne(new_row(hz_v))),
                           r.error(writes.invalidated_msg),

                           // Otherwise, we can safely update the row and increment the version
                           writes.apply_version(old_row.merge(new_row), old_row(hz_v).default(-1).add(1))
                         )
                       ), { returnChanges: 'always' }),

                   // The new row did not have an id, so we insert it with an autogen id
                   collection.table.insert(writes.apply_version(new_row, 0),
                                           { returnChanges: 'always' })))
        .run(conn, reql_options)
    ).then(done).catch(done);
};

module.exports = { run };
