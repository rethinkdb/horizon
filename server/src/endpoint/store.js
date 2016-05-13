'use strict';

const check = require('../error').check;
const store = require('../schema/horizon_protocol').store;
const reql_options = require('./common').reql_options;
const writes = require('./writes');

const Joi = require('joi');
const r = require('rethinkdb');

const run = (raw_request, context, ruleset, metadata, send, done) => {
  const parsed = Joi.validate(raw_request.options, store);
  if (parsed.error !== null) { throw new Error(parsed.error.details[0].message); }

  const collection = metadata.get_collection(parsed.value.collection);
  const conn = metadata.connection();
  const response_data = [ ];

  r.expr(parsed.value.data.map((row) => (row.id || null)))
    .map((id) => r.branch(id.eq(null), null, r.table(collection.table).get(id)))
    .run(conn, reql_options)
    .then((old_rows) => {
      check(old_rows.length === parsed.value.data.length, 'Unexpected ReQL response size.');
      const valid_rows = [ ];
      for (let i = 0; i < old_rows.length; ++i) {
        if (ruleset.validate(context, old_rows[i], parsed.value.data[i])) {
          if (old_rows[i] === null) {
            // This will tell the ReQL query that the row should not exist
            delete parsed.value.data[i][writes.version_field];
          } else {
            // No need to fail if the client has an outdated version - the write is still
            // allowed
            parsed.value.data[i][writes.version_field] = old_rows[i][writes.version_field];
          }
          response_data.push(null);
          valid_rows.push(parsed.value.data[i]);
        } else {
          response_data.push(new Error(writes.unauthorized_error));
        }
      }

      return r.expr(valid_rows)
               .forEach((new_row) =>
                 r.branch(new_row.hasFields('id'),
                          r.table(collection.table)
                            .get(new_row('id'))
                            .replace((old_row) =>
                              r.branch(r.and(old_row.eq(null),
                                             new_row.hasFields(writes.version_field)),
                                       r.error(writes.missing_error),
                                       r.or(r.and(new_row.hasFields(writes.version_field),
                                                  old_row(writes.version_field).ne(new_row(writes.version_field))),
                                            r.and(new_row.hasFields(writes.version_field).not(),
                                                  old_row.ne(null))),
                                       r.error(writes.invalidated_error),
                                       old_row.eq(null),
                                       writes.apply_version(new_row, 0),
                                       writes.apply_version(new_row, old_row(writes.version_field).add(1))),
                              { returnChanges: 'always' }),
                          r.table(collection.table)
                            .insert(writes.apply_version(new_row, 0),
                                    { returnChanges: 'always' })))
               .run(conn, reql_options);
    }).then((store_results) => {
      done(writes.make_write_response(response_data, store_results));
    }).catch(done);
};

module.exports = { run };
