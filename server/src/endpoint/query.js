'use strict';

const { query } = require('../schema/fusion_protocol');

const Joi = require('joi');
const r = require('rethinkdb');

// This is also used by the 'subscribe' endpoint
const make_reql = (request) => {
  var options = Joi.attempt(request.options, query);
  var { selection, order, limit } = options;
  var index = options.field_name;

  var reql = r.table(options.collection);

  if (selection) {
    switch (selection.type) {
      case 'find_one':
        reql = reql.getAll(selection.args[0], { index }).nth(0);
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

const handle_response = (query, response, send_cb) => {
  if (response.constructor.name === 'Cursor') {
    query.client.cursors.set(query.request.request_id, response);
    response.each((err, item) => {
        if (err !== null) {
          send_cb({ error: `${err}` });
        } else {
          send_cb({ data: [item] });
        }
      }, () => {
        query.client.cursors.delete(response);
        send_cb({ data: [], state: 'complete' });
      });
  } else if (response.constructor.name === 'Array') {
    send_cb({ data: response, state: 'complete' });
  } else {
    send_cb({ data: [response], state: 'complete' });
  }
};

module.exports = { make_reql, handle_response };
