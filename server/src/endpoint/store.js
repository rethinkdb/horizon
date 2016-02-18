'use strict';

const store = require('../schema/horizon_protocol').store;
const handle_response = require('./insert').handle_response;

const Joi = require('joi');
const r = require('rethinkdb');

const make_reql = (raw_request, metadata) => {
  const parsed = Joi.validate(raw_request.options, store);
  if (parsed.error !== null) { throw new Error(parsed.error.details[0].message); }

  const table = metadata.get_table(parsed.value.collection);
  return r.table(table.name).insert(parsed.value.data, { conflict: 'replace' });
};

module.exports = { make_reql, handle_response };
