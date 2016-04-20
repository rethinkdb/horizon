'use strict';

const check = require('../error').check;
const insert = require('../schema/horizon_protocol').insert;
const validate = require('../permissions/validator').validate;

const Joi = require('joi');
const r = require('rethinkdb');

const run = (raw_request, context, rules, metadata, done_cb) => {
  const parsed = Joi.validate(raw_request.options, insert);
  if (parsed.error !== null) { done_cb(new Error(parsed.error.details[0].message)); }

  const table = metadata.get_table(parsed.value.collection);

  const response_data = [ ];
  const valid_rows = [ ];
  for (const row of parsed.value.data) {
    if (validate(rules, context, null, row)) {
      valid_rows.push(row);
      response_data.push(null); // Placeholder for ID from the server
    } else {
      response_data.push({ error: 'Operation is not permitted.' });
    }
  };

  const next_index = (i) => {
    const res = i;
    while (response_data[res] !== null) {
      ++res;
      check(res < response_data.length);
    }
    return res;
  };

  const make_error_response = (err) => {
    let index = 0;
    for (const row of valid_rows) {
       index = next_index(index);
       response_data[index] = { error: err.message };
    }
    return { data: response_data, state: 'complete' };
  };

  if (valid_rows.length === 0) {
    done_cb(new Error('Operation is not permitted.'));
  } else {
    r.table(table.name)
     .insert(valid_rows, { conflict: 'error' })
     .run(metadata.get_connection())
     .then((res) => {
       if (res.errors !== 0) {
         done_cb(new Error(response.first_error));
       } else {
         let response_index = 0;
         let key_index = 0;
         for (const row of valid_rows) {
           response_index = next_index(response_index);
           if (row.id !== undefined) {
             // TODO: response data also needs to include the version UUIDs we (still need to) generate
             response_data[index] = row.id;
           } else {
             if (!response.generated_keys || response.generated_keys.length <= key_index) {
               const response = make_error_response(
                 new Error('ReQL response does not contain enough generated keys.'));
               done_cb(null, response);
               return;
             }
             response_data[index] = response.generated_keys[key_index++];
           }
         }
         done_cb(null, { data: response_data, state: 'complete' });
       }
     },
     (err) => {
        done_cb(null, make_error_response(err));
     });
  }
}

module.exports = { run };
