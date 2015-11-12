'use strict';

const { check } = require('../error');
const { insert } = require('../schema/fusion_protocol');

const Joi = require('joi');
const r = require('rethinkdb');

const make_reql = (raw_request) => {
  const { value: { data, collection }, error } = Joi.validate(raw_request.options, insert);
  if (error !== null) { throw new Error(error.details[0].message); }
  return r.table(collection).insert(data, { conflict: 'error' });
};

// This is also used by the 'store' and 'upsert' endpoints
const handle_response = (request, response, send_cb) => {
  if (response.errors !== 0) {
    send_cb({ error: response.first_error });
  } else {
    let index = 0;
    const ids = request.raw.options.data.map((row) => {
        if (row.id === undefined) {
          check(response.generated_keys && response.generated_keys.length > index,
                `ReQL response does not contain enough generated keys.`);
          return response.generated_keys[index++];
        }
        return row.id;
      });
    send_cb({ data: ids, state: 'complete' });
  }
};

module.exports = { make_reql, handle_response };
