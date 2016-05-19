'use strict';

const check = require('../error').check;
const replace = require('../schema/horizon_protocol').replace;
const reql_options = require('./common').reql_options;
const writes = require('./writes');

const Joi = require('joi');
const r = require('rethinkdb');

const run = (raw_request, context, ruleset, metadata, send, done) => {
  const parsed = Joi.validate(raw_request.options, replace);
  if (parsed.error !== null) { throw new Error(parsed.error.details[0].message); }

  const collection = metadata.collection(parsed.value.collection);
  const conn = metadata.connection();

  const response_data = [ ];

  r.expr(parsed.value.data.map((row) => row.id))
    .map((id) => collection.table.get(id))
    .run(conn, reql_options)
    .then((old_rows) => {
      check(old_rows.length === parsed.value.data.length, 'Unexpected ReQL response size.');
      const valid_rows = [ ];
      for (let i = 0; i < old_rows.length; ++i) {
        if (old_rows[i] === null) {
          response_data.push(new Error(writes.missing_error));
        } else if (!ruleset.validate(context, old_rows[i], parsed.value.data[i])) {
          response_data.push(new Error(writes.unauthorized_error));
        } else {
          response_data.push(null);
          parsed.value.data[i][writes.version_field] = old_rows[i][writes.version_field];
          valid_rows.push(parsed.value.data[i]);
        }
      }

      return r.expr(valid_rows)
          .forEach((new_row) =>
            collection.table.get(new_row('id')).replace((old_row) =>
                r.branch(// The row may have been deleted between the get and now
                         old_row.eq(null),
                         r.error(writes.missing_error),

                         // The row may have been changed between the get and now
                         old_row(writes.version_field).ne(new_row(writes.version_field)),
                         r.error(writes.invalidated_error),

                         // Otherwise, we can safely replace the row
                         writes.apply_version(new_row, old_row(writes.version_field).add(1))),
                { returnChanges: 'always' }))
        .run(conn, reql_options);
    }).then((replace_results) => {
      done(writes.make_write_response(response_data, replace_results));
    }).catch(done);
};

module.exports = { run };
