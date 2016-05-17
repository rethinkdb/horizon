'use strict';

const insert = require('../schema/horizon_protocol').insert;
const writes = require('./writes');
const reql_options = require('./common').reql_options;

const Joi = require('joi');
const r = require('rethinkdb');

const run = (raw_request, context, ruleset, metadata, send, done) => {
  const parsed = Joi.validate(raw_request.options, insert);
  if (parsed.error !== null) { done(new Error(parsed.error.details[0].message)); }

  const collection = metadata.collection(parsed.value.collection);
  const conn = metadata.connection();

  // TODO: shortcut if validation isn't needed (for all write request types)
  const response_data = [ ];
  const valid_rows = [ ];
  for (let i = 0; i < parsed.value.data.length; ++i) {
    if (ruleset.validate(context, null, parsed.value.data[i])) {
      valid_rows.push(parsed.value.data[i]);
      response_data.push(null);
    } else {
      response_data.push(new Error('Operation not permitted.'));
    }
  }

  // TODO: shortcut if valid rows is empty (for all write request types)
  collection.table
    .insert(valid_rows.map((row) => writes.apply_version(r.expr(row), 0)),
            { conflict: 'error', returnChanges: 'always' })
    .run(conn, reql_options)
    .then((insert_results) => {
      done(writes.make_write_response(response_data, insert_results));
    }).catch(done);
};

module.exports = { run };
