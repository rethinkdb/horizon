'use strict';

const { query } = require('../schema/fusion_protocol');

const Joi = require('joi');
const r = require('rethinkdb');

// This is also used by the 'subscribe' endpoint
const make_reql = (raw_request) => {
  const { value: { collection, selection, order, limit, field_name: index }, error } =
    Joi.validate(raw_request.options, query);
  if (error !== null) { throw new Error(error.details[0].message); }

  let reql = r.table(collection);

  if (selection) {
    switch (selection.type) {
    case 'find_one':
      reql = reql.getAll(selection.args[0], { index }).limit(1);
      break;
    case 'find':
      reql = reql.getAll(r.args(selection.args), { index });
      break;
    case 'between':
      reql = reql.between(selection.args[0], selection.args[1], { index });
      break;
    }
  }

  if (order) {
    if (order === 'descending') {
      reql = reql.orderBy({ index: r.desc(index) });
    } else {
      reql = reql.orderBy({ index });
    }
  }

  if (limit) {
    reql = reql.limit(limit);
  }

  return reql;
};

// All queries result in a cursor response
const handle_response = (request, cursor, send_cb) => {
  request.client.cursors.set(request.id, cursor);
  cursor.each((err, item) => {
    if (err !== null) {
      send_cb({ error: `${err}` });
    } else {
      send_cb({ data: [ item ] });
    }
  }, () => {
    request.client.cursors.delete(cursor);
    send_cb({ data: [ ], state: 'complete' });
  });
};

module.exports = { make_reql, handle_response };
