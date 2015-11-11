'use strict';

const { replace } = require('../schema/fusion_protocol');
const { handle_response } = require('./remove');

const Joi = require('joi');
const r = require('rethinkdb');

const make_reql = (request) => {
  var { value: { data, collection }, error } = Joi.validate(request.options, replace);
  if (error !== null) { throw new Error(error.details[0].message); }

  return r.expr(data).forEach((row) =>
        r.table(collection).get(row('id')).replace((old) =>
          r.branch(old.ne(null), row,
           r.error(r.expr(`The document with id `)
                    .add(row('id').toJSON())
                    .add(` was missing.`)))));
};

module.exports = { make_reql, handle_response };
