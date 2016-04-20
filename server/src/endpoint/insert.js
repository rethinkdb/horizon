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
  const conn = metadata.get_connection();

  const results = parsed.value.data.map((row) => new Promise((resolve) => {
    if (validate(rules, context, null, row)) {
      // TODO: add version field
      r.table(table.name).insert(row, { conflict: 'error' }).run(conn).then((res) => {
        if (res.errors !== 0) {
          resolve(new Error(res.first_error));
        } else if (row.id !== undefined) {
          resolve(row.id);
        } else if (response.generated_keys && response.generated_keys.length === 1) {
          resolve(response.generated_keys[0]);
        } else {
          resolve(new Error('Write query should have generated a key.'));
        }
      }, (err) => resolve(err));
    } else {
      resolve(new Error('Operation is not permitted.'));
    }
  }));

  Promise.all(results).then((data) => {
    done_cb(make_write_response(data));
  }).catch(done_cb);
}

const make_write_response = (data) => {
  // TODO: pass back versions (make data an array of pairs?)
  for (let i = 0; i < data.length; ++i) {
    if (data[i] instanceof Error) {
      data[i] = { error: data[i].message };
    }
  }
  return { data, state: 'complete' };
};

module.exports = { run, make_write_response };
