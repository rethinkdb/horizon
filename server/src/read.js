'use strict';

const Joi = require('joi');
const r = require('rethinkdb');
const protocol = require('./schema/protocol');
const check = require('./error.js').check;

module.exports.make_read_reql = function (request) {
  var options = Joi.attempt(request.options, protocol.read);
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
    // TODO: get this working in the schema
    if (selection) { check(selection.type === 'between', `"order" is not allowed`); }
    if (order === 'descending') {
      reql = reql.orderBy({ index: r.desc(index) });
    } else {
      reql = reql.orderBy({ index });
    }
  }

  if (limit) {
    // TODO: get this working in the schema
    if (selection) { check(selection.type !== 'find_one', `"limit" is not allowed`); }
    reql = reql.limit(limit);
  }

  if (request.type === 'subscribe') {
    reql = reql.changes({ include_states: true });
  }

  return reql;
};

var handle_cursor = function (query, cursor, send_cb) {
  query.client.cursors.set(query.request.request_id, cursor);
  cursor.each((err, item) => {
      if (err !== null) {
        send_cb({ error: `${err}` });
      } else {
        send_cb({ data: [item] });
      }
    }, () => {
      query.client.cursors.delete(cursor);
      send_cb({ data: [], state: 'complete' });
    });
};

var handle_feed = function (query, feed, send_cb) {
  query.client.cursors.set(query.request.request_id, feed);
  feed.each((err, item) => {
      if (err !== null) {
        send_cb({ error: `${err}` });
      } else if (item.state === 'initializing') {
        // Do nothing - we don't care
      } else if (item.state === 'ready') {
        send_cb({ state: 'synced' });
      } else {
        send_cb({ data: [item] });
      }
    }, () => {
      query.client.cursors.delete(feed);
      send_cb({ data: [], state: 'complete' });
    });
};

module.exports.handle_read_response = function (query, response, send_cb) {
  if (query.request.type === 'query') {
    if (response.constructor.name === 'Cursor') {
      handle_cursor(query, response, send_cb);
    } else if (response.constructor.name === 'Array') {
      send_cb({ data: response, state: 'complete' });
    } else {
      send_cb({ data: [response], state: 'complete' });
    }
  } else {
    handle_feed(query, response, send_cb);
  }
}
