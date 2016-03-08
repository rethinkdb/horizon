'use strict';

const update = require('../schema/horizon_protocol').update;
const handle_response = require('./remove').handle_response;

const Joi = require('joi');
const r = require('rethinkdb');

const make_reql = (raw_request, metadata) => {
  const parsed = Joi.validate(raw_request.options, update);
  if (parsed.error !== null) { throw new Error(parsed.error.details[0].message); }

  const table = metadata.get_table(parsed.value.collection);
  return r.expr(parsed.value.data).forEach((row) =>
        r.table(table.name).get(row('id')).replace((old) =>
         r.branch(old.ne(null), old.merge(row),
           r.error(r.expr('The document with id ')
                    .add(row('id').toJSON())
                    .add(' was missing.')))));
};

module.exports = { make_reql, handle_response };
