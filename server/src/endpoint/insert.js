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

  writes.retry_loop(parsed.value.data, ruleset, parsed.value.timeout,
    (rows) => // pre-validation, all rows
      Array(rows.length).fill(null),
    (row, info) => { // validation, each row
      if (!ruleset.validate(context, info, row)) {
        return new Error(writes.unauthorized_msg);
      }
    },
    (rows) => // write to database, all valid rows
      collection.table
        .insert(rows.map((row) => writes.apply_version(r.expr(row), 0)),
                { returnChanges: 'always' })
        .run(conn, reql_options)
  ).then(done).catch(done);
};

module.exports = { run };
