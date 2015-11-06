'use strict';

const error = require('./error.js');
const r = require('rethinkdb');

var check = error.check;
var fail = error.fail;

// TODO: check for unknown fields
module.exports.make_read_reql = function (request) {
  var type = request.type;
  var options = request.options;
  var collection = options.collection;
  var index = options.field_name || 'id'; // TODO: possibly require this to be specified

  check(collection !== undefined, `'options.collection' must be specified.`);
  check(collection.constructor.name === 'String',
        `'options.collection' must be a string.`)

  var reql = r.table(collection);

  var selection = options.selection;
  var order = options.order;
  var limit = options.limit;

  if (selection !== undefined) {
    var selection_type = selection.type;
    var selection_args = selection.args;
    check(selection_type !== undefined, `'options.selection.type' must be specified.`);
    check(selection_args !== undefined, `'options.selection.args' must be specified.`);
    check(selection_args.constructor.name === 'Array', `'options.selection.args' must be an array.`)

    if (selection_type === 'find_one') {
      check(selection_args.length === 1, `'options.selection.args' must have one argument for 'find_one'.`);
      check(index === 'id', `'options.field_name' must be 'id' for 'find_one'.`);
      check(order === undefined, `'options.order' cannot be used with 'find_one'.`);
      check(limit === undefined, `'options.limit' cannot be used with 'find_one'.`);
      reql = reql.get(selection_args[0]);
    } else if (selection_type === 'find') {
      check(order === undefined, `'options.order' cannot be used with 'find'.`);
      reql = reql.getAll.apply(reql, selection_args.concat({ index: index }));
    } else if (selection_type === 'between') {
      check(selection_args.length === 2, `'options.selection.args' must have two arguments for 'between'.`);
      reql = reql.between.apply(reql, selection_args.concat({ index: index }));
    } else {
      fail(`'options.selection.type' must be one of 'find', 'find_one', or 'between'.`)
    }
  }

  if (order === 'ascending') {
    reql = reql.orderBy({ index: r.asc(index) })
  } else if (order === 'descending') {
    reql = reql.orderBy({ index: r.desc(index) })
  } else if (order !== undefined) {
    fail(`'options.order' must be either 'ascending' or 'descending'.`);
  }

  if (limit !== undefined) {
    check(parseInt(limit) === limit, `'options.limit' must be an integer.`);
    reql = reql.limit(limit);
  }

  if (type === 'subscribe') {
    reql = reql.changes({ include_states: true });
  }

  return reql;
};

var handle_cursor = function (client, cursor, send_cb) {
  client.cursors.add(cursor);
  cursor.each((err, item) => {
      if (err !== null) {
        send_cb({ error: `${err}` });
      } else {
        send_cb({ data: [item] });
      }
    }, () => {
      client.cursors.delete(cursor);
      send_cb({ data: [], state: 'complete' });
    });
};

var handle_feed = function (client, feed, send_cb) {
  client.cursors.add(feed);
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
      client.cursors.delete(cursor);
      send_cb({ data: [], state: 'complete' });
    });
};

module.exports.handle_read_response = function (client, request, response, send_cb) {
  if (request.type === 'query') {
    if (response.constructor.name === 'Cursor') {
      handle_cursor(client, response, send_cb);
    } else if (response.constructor.name === 'Array') {
      send_cb({ data: response, state: 'complete' });
    } else {
      send_cb({ data: [response], state: 'complete' });
    }
  } else {
    handle_feed(client, response, send_cb);
  }
}
