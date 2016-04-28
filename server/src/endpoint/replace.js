'use strict';

const check = require('../error').check;
const replace = require('../schema/horizon_protocol').replace;
const validate = require('../permissions/rule').validate;
const writes = require('./writes');

const Joi = require('joi');
const r = require('rethinkdb');

const run = (raw_request, context, rules, metadata, send_cb) => {
  const parsed = Joi.validate(raw_request.options, replace);
  if (parsed.error !== null) { throw new Error(parsed.error.details[0].message); }

  const table = metadata.get_table(parsed.value.collection);
  const conn = metadata.get_connection();

  const response_data = [ ];

  r.expr(parsed.value.data.map((row) => row.id))
    .map((id) => r.table(table.name).get(id))
    .run(conn)
    .then((old_rows) => {
      check(old_rows.length === parsed.value.data.length);
      const valid_rows = [ ];
      for (let i = 0; i < old_rows.length; ++i) {
        if (old_rows[i] === null) {
          response_data.push(new Error(writes.missing_error));
        } else if (validate(rules, context, old_rows[i], parsed.value.data[i])) {
          response_data.push(null);
          valid_rows.push(parsed.value.data[i]);
        } else {
          response_data.push(new Error(writes.unauthorized_error));
        }
      }

      return r.expr(valid_rows).forEach((new_row) =>
        r.table(table.name).get(new_row('id')).replace((old_row) =>
          r.branch(old_row.eq(null),
                   r.error(writes.missing_error),
                   old_row(writes.version_field).ne(new_row(writes.version_field)),
                   r.error(writes.invalidated_error),
                   writes.add_new_version(new_row)),
          { returnChanges: 'always' }))
        .run(conn);
    }).then((replace_results) => {
      send_cb(writes.make_write_response(response_data, replace_results));
    }).catch(send_cb);
};

module.exports = { run };
