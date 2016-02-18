'use strict';

const upsert = require('../schema/horizon_protocol').upsert;
const handle_response = require('./insert').handle_response;

const Joi = require('joi');
const r = require('rethinkdb');

const make_reql = (raw_request, metadata) => {
  const parsed = Joi.validate(raw_request.options, upsert);
  if (parsed.error !== null) { throw new Error(parsed.error.details[0].message); }

  const table = metadata.get_table(parsed.value.collection);
  return r.table(table.name).insert(parsed.value.data, { conflict: 'update' });
};

module.exports = { make_reql, handle_response };
