'use strict';

const { update } = require('../schema/fusion_protocol');
const { handle_response } = require('./remove');

const Joi = require('joi');
const r = require('rethinkdb');

const make_reql = (raw_request) => {
  var { value: { data, collection }, error } = Joi.validate(raw_request.options, update);
  if (error !== null) { throw new Error(error.details[0].message); }

  return r.expr(data).forEach((row) =>
        r.table(collection).get(row('id')).replace((old) =>
         r.branch(old.ne(null), old.merge(row),
           r.error(r.expr(`The document with id `)
                    .add(row('id').toJSON())
                    .add(` was missing.`)))));
};

module.exports = { make_reql, handle_response };
