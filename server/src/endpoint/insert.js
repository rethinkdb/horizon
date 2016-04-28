'use strict';

const insert = require('../schema/horizon_protocol').insert;
const validate = require('../permissions/rule').validate;
const writes = require('./writes');

const Joi = require('joi');
const r = require('rethinkdb');

const run = (raw_request, context, rules, metadata, send_cb) => {
  const parsed = Joi.validate(raw_request.options, insert);
  if (parsed.error !== null) { send_cb(new Error(parsed.error.details[0].message)); }

  const table = metadata.get_table(parsed.value.collection);
  const conn = metadata.get_connection();

  // TODO: shortcut if validation isn't needed (for all write request types)
  const response_data = [ ];
  const valid_rows = [ ];
  for (let i = 0; i < parsed.value.data.length; ++i) {
    if (validate(rules, context, null, parsed.value.data[i])) {
      valid_rows.push(parsed.value.data[i]);
      response_data.push(null);
    } else {
      response_data.push(new Error('Operation not permitted.'));
    }
  }

  // TODO: shortcut if valid rows is empty (for all write request types)
  r.table(table.name)
    .insert(valid_rows.map((row) => writes.add_new_version(row)), { conflict: 'error' })
    .run(conn)
    .then((insert_results) => {
      send_cb(writes.make_write_response(response_data, insert_results));
    }).catch(send_cb);
};

module.exports = { run };
