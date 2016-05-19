'use strict';

const check = require('../error').check;
const update = require('../schema/horizon_protocol').update;
const reql_options = require('./common').reql_options;
const writes = require('./writes');

const Joi = require('joi');
const r = require('rethinkdb');

const run = (raw_request, context, ruleset, metadata, send, done) => {
  const parsed = Joi.validate(raw_request.options, update);
  if (parsed.error !== null) { throw new Error(parsed.error.details[0].message); }

  const collection = metadata.collection(parsed.value.collection);
  const conn = metadata.connection();
  const response_data = [ ];

  r.expr(parsed.value.data)
    .map((new_row) =>
      collection.table.get(new_row('id')).do((old_row) =>
        r.branch(old_row.eq(null),
                 null,
                 [ old_row, old_row.merge(new_row) ])))
    .run(conn, reql_options)
    .then((changes) => {
      check(changes.length === parsed.value.data.length, 'Unexpected ReQL response size.');
      const valid_rows = [ ];
      for (let i = 0; i < changes.length; ++i) {
        if (changes[i] === null) {
          response_data.push(new Error(writes.missing_error));
        } else if (!ruleset.validate(context, changes[i][0], changes[i][1])) {
          response_data.push(new Error(writes.unauthorized_error));
        } else {
          const row = parsed.value.data[i];
          if (row[writes.version_field] === undefined) {
            row[writes.version_field] = changes[i][0][writes.version_field];
          }
          valid_rows.push(row);
          response_data.push(null);
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

                         // Otherwise we can safely update the row and increment the version
                         writes.apply_version(old_row.merge(new_row), old_row(writes.version_field).add(1))),
                { returnChanges: 'always' }))
          .run(conn, reql_options);
    }).then((update_results) => {
      done(writes.make_write_response(response_data, update_results));
    }).catch(done);
};

module.exports = { run };
