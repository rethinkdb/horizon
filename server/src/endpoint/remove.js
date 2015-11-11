'use strict';

const { remove } = require('../schema/fusion_protocol');

const Joi = require('joi');
const r = require('rethinkdb');

const make_reql = (request) => {
  var { value: { data, collection }, error } = Joi.validate(request.options, remove);
  if (error !== null) { throw new Error(error.details[0].message); }

  return r.table(collection)
          .getAll(r.args(data.map((row) => row.id)), { index: 'id' })
          .delete();
};

// This is also used by the 'replace' and 'update' endpoints
const handle_response = (query, response, send_cb) => {
  if (response.errors !== 0) {
    send_cb({ error: response.first_error });
  } else {
    send_cb({ data: query.request.options.data.map((row) => row.id), state: 'complete' });
  }
};

module.exports = { make_reql, handle_response };
