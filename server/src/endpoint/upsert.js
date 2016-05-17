'use strict';

const check = require('../error').check;
const upsert = require('../schema/horizon_protocol').upsert;
const reql_options = require('./common').reql_options;
const writes = require('./writes');

const Joi = require('joi');
const r = require('rethinkdb');

const run = (raw_request, context, ruleset, metadata, send, done) => {
  const parsed = Joi.validate(raw_request.options, upsert);
  if (parsed.error !== null) { throw new Error(parsed.error.details[0].message); }

  const collection = metadata.collection(parsed.value.collection);
  const conn = metadata.connection();
  const response_data = [ ];

  r.expr(parsed.value.data)
    .map((new_row) =>
      r.branch(new_row.hasFields('id'),
               collection.table.get(new_row('id')).do((old_row) =>
                 r.branch(old_row.eq(null),
                          [ null, new_row ],
                          [ old_row, old_row.merge(new_row) ])),
               [ null, new_row ]))
    .run(conn, reql_options)
    .then((changes) => {
      check(changes.length === parsed.value.data.length, 'Unexpected ReQL response size.');
      const valid_rows = [ ];
      for (let i = 0; i < changes.length; ++i) {
        if (ruleset.validate(context, changes[i][0], changes[i][1])) {
          if (changes[i][0] === null) {
            // This tells the ReQL query that the row should not exist
            delete parsed.value.data[i][writes.version_field];
          } else if (parsed.value.data[i][writes.version_field] === undefined) {
            parsed.value.data[i][writes.version_field] = changes[i][0][writes.version_field];
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
                          collection.table.get(new_row('id')).replace((old_row) =>
                              r.branch(// There are several things that may occur to invalidate the write:
                                       // * the row does not have the expected version
                                       // * we were expecting the row to not exist, but it does
                                       // * we were expecting the row to exist, but it doesn't
                                       r.or(r.and(new_row.hasFields(writes.version_field),
                                                  old_row(writes.version_field).ne(new_row(writes.version_field))),
                                            r.and(new_row.hasFields(writes.version_field).not(),
                                                  old_row.ne(null)),
                                            r.and(old_row.eq(null),
                                                  new_row.hasFields(writes.version_field))),
                                       r.error(writes.invalidated_error),

                                       // The row may not exist, in which case we insert a new row
                                       old_row.eq(null),
                                       writes.apply_version(new_row, 0),

                                       // Otherwise, we can safely update the row and increment the version
                                       writes.apply_version(old_row.merge(new_row), old_row(writes.version_field).add(1))),
                              { returnChanges: 'always' }),

                          // The new row did not have an id, so we insert it with an autogen id
                          collection.table.insert(writes.apply_version(new_row, 0),
                                                  { returnChanges: 'always' })))
               .run(conn, reql_options);
    }).then((upsert_results) => {
      done(writes.make_write_response(response_data, upsert_results));
    }).catch(done);
};

module.exports = { run };
