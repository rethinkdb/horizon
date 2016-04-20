'use strict';

const store = require('../schema/horizon_protocol').store;
const handle_response = require('./insert').handle_response;

const Joi = require('joi');
const r = require('rethinkdb');

const run = (raw_request, context, rules, metadata, done_cb) => {
  const conn = metadata.get_connection();
  const parsed = Joi.validate(raw_request.options, store);
  if (parsed.error !== null) { throw new Error(parsed.error.details[0].message); }

  const table = metadata.get_table(parsed.value.collection);

  // Get the existing version of each row, then validate changes
  const ids = [ ];
  const old_values = [ ];
  const valid_rows = [ ];
  const response_data = [ ];
  for (const row of parsed.value.data) {
    if (row.id !== undefined) {
      ids.push(row.id);
      old_values.push(row.id);
    } else {
      old_values.push(null);
    }
  }

  r.table(table.name)
   .get_all(r.args(ids))
   .run(conn).then((res) => {
     let index = 0;

     check(old_values.length === parsed.value.data.length);
     for (let i = 0; i < old_values.length; ++i) {
       if (validate(rules, context, old_values[i], parsed.value.data[i])) {
         valid_rows.push(parsed.value.data[i]);
         response_data.push(null);
       } else {
         response_data.push({ error: 'Operation is not permitted.' });
       }
     }

     return r.table(table.name).insert(valid_rows, { conflict: 'replace' }).run(conn);
  }).then((res) => {
    
  }).catch((err) => {
    done_cb(null, make_error_response(err));
  });
};

const make_reql = (raw_request, metadata) => {
  const parsed = Joi.validate(raw_request.options, store);
  if (parsed.error !== null) { throw new Error(parsed.error.details[0].message); }

  const table = metadata.get_table(parsed.value.collection);
  return r.table(table.name).insert(parsed.value.data, { conflict: 'replace' });
};

module.exports = { make_reql, handle_response };
