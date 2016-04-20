'use strict';

const store = require('../schema/horizon_protocol').store;
const make_write_response = require('./insert').make_write_response;

const Joi = require('joi');
const r = require('rethinkdb');

const run = (raw_request, context, rules, metadata, done_cb) => {
  const parsed = Joi.validate(raw_request.options, store);
  if (parsed.error !== null) { throw new Error(parsed.error.details[0].message); }

  const table = metadata.get_table(parsed.value.collection);
  const conn = metadata.get_connection();

  const results = parsed.value.data.map((row) => new Promise((resolve) => {
    // Get old row, if it exists, to check for validity
    if (row.id === undefined || !validation_needed(rules)) {
      r.table(table.name).insert(row, { conflict: 'replace' }).run(conn).then((res) => {

    }

    r.table(table.name).get(row.id).run(conn).then((old_row) => {
      if (validate(rules, context, old_row, row)) {
        // TODO: check old version, add new version
        r.table(table.name).insert(row, { conflict: 'replace' }).run(conn).then((res) => {
          if (res.errors !== 0) {
            resolve(new Error(res.first_error));
          } else if (row.id !== undefined) {
            resolve(row.id);
          } else if (response.generated_keys && response.generated_keys.length === 1) {
            resolve(response.generated_keys[0]);
          } else {
            resolve(new Error('Write query should have generated a key.'));
          }
        }, resolve);
      } else {
        resolve(new Error('Operation is not permitted.'));
      }
    }, resolve);
  }));

  Promise.all(results).then((data) => {
    done_cb(make_write_response(data));
  }).catch(done_cb);
};

const make_reql = (raw_request, metadata) => {
  const parsed = Joi.validate(raw_request.options, store);
  if (parsed.error !== null) { throw new Error(parsed.error.details[0].message); }

  const table = metadata.get_table(parsed.value.collection);
  return r.table(table.name).insert(parsed.value.data, { conflict: 'replace' });
};

module.exports = { make_reql, handle_response };
