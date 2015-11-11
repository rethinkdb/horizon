'use strict';

const { check } = require('../error');
const { insert } = require('../schema/fusion_protocol');

const Joi = require('joi');
const r = require('rethinkdb');

const make_reql = (request) => {
  var { data, collection } = Joi.attempt(request.options, insert);
  return r.table(collection).insert(data, { conflict: 'error' });
}

// This is also used by the 'store' and 'upsert' endpoints
const handle_response = (query, response, send_cb) => {
  if (response.errors !== 0) {
    send_cb({ error: response.first_error });
  } else {
    var index = 0;
    var ids = query.request.options.data.map((row) => {
        if (row.id === undefined) {
          check(response.generated_keys && response.generated_keys.length > index);
          return response.generated_keys[index++];
        }
        return row.id;
      });
    send_cb({ data: ids, state: 'complete' });
  }
};

module.exports = { make_reql, handle_response };
