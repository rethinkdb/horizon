'use strict';

const { upsert } = require('../schema/fusion_protocol');
const { handle_response } = require('./insert');

const Joi = require('joi');
const r = require('rethinkdb');

const make_reql = (request) => {
  var { value: { data, collection }, error } = Joi.validate(request.options, upsert);
  if (error !== null) { throw new Error(error.details[0].message); }

  return r.table(collection).insert(data, { conflict: 'update' });
};

module.exports = { make_reql, handle_response };
