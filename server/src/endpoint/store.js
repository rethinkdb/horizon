'use strict';

const { store } = require('../schema/fusion_protocol');
const { handle_response } = require('./insert');

const Joi = require('joi');
const r = require('rethinkdb');

const make_reql = (raw_request, metadata) => {
  const { value: { data, collection }, error } = Joi.validate(raw_request.options, store);
  if (error !== null) { throw new Error(error.details[0].message); }

  const table = metadata.get_table(collection);
  return r.table(table.name).insert(data, { conflict: 'replace' });
};

module.exports = { make_reql, handle_response };
