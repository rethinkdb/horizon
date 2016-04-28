'use strict';

const check = require('../error').check;
const remove = require('../schema/horizon_protocol').remove;
const validate = require('../permissions/rule').validate;
const writes = require('./writes');

const Joi = require('joi');
const r = require('rethinkdb');

const run = (raw_request, context, rules, metadata, send_cb) => {
  const parsed = Joi.validate(raw_request.options, remove);
  if (parsed.error !== null) { throw new Error(parsed.error.details[0].message); }

  const table = metadata.get_table(parsed.value.collection);
  const conn = metadata.get_connection();
  const response_data = [ ];

  r.table(table.name)
    .getAll(r.args(parsed.value.data.map((row) => row.id)), { index: 'id' })
    .run(conn)
    .then((old_rows) => {
      check(old_rows.length === parsed.value.data.length);
      const valid_info = [ ];
      for (let i = 0; i < old_rows.length; ++i) {
        if (validate(rules, context, old_rows[i], null)) {
          const info = { id: old_rows[i].id };
          info[writes.version_field] = old_rows[i][writes.version_field];
          valid_info.push(info);
          response_data.push(null);
        } else {
          response_data.push(new Error('Operation not permitted.'));
        }
      }

      return r.expr(valid_info).forEach((info) =>
               r.table(table.name)
                 .get(info.id).replace((row) =>
                   r.branch(row.eq(null),
                            r.error(writes.missing_error),
                            row(writes.version_field).ne(info(writes.version_field)),
                            r.error(writes.invalidated_error),
                            null),
                   { returnChanges: 'always' }))
               .run(conn);
    }).then((remove_results) => {
      send_cb(writes.make_write_response(response_data, remove_results));
    }).catch(send_cb);
};

module.exports = { run };
