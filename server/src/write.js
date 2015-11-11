'use strict';

const { check, fail } = require('./error');

const r = require('rethinkdb');

const make_write_reql = (request) => {
  var type = request.type;
  var options = request.options;
  var collection = options.collection;
  var data = options.data;

  check(data !== undefined, `'options.data' must be specified.`);
  check(data.length >= 0, `'options.data' must be an array of at least length 1.`);
  check(collection !== undefined, `'options.collection' must be specified.`);
  check(collection.constructor.name === 'String',
        `'options.collection' must be a string.`)

  var reql = r.table(collection);

  switch (type) {
  case 'store':
    var missing = options.missing;
    var conflict = options.conflict;
    check(missing !== undefined, `'options.missing' must be specified for a 'store' operation.`);
    check(conflict !== undefined, `'options.conflict' must be specified for a 'store' operation.`);
    check(conflict === 'update' || conflict === 'replace' || conflict === 'error',
          `'options.conflict' must be one of 'update', 'replace', or 'error'.`);

    if (missing === 'insert') {
      reql = reql.insert(data, { conflict: conflict });
    } else if (missing === 'error') {
      if (conflict === 'update') {
        reql = r.expr(data).forEach((row) =>
          reql.get(row('id')).replace((old) =>
           r.branch(old.ne(null), old.merge(row),
             r.error(r.expr("The document with id '")
                      .add(row('id').coerceTo('string'))
                      .add("' was missing.")))));
      } else if (conflict === 'replace') {
        reql = r.expr(data).forEach((row) =>
          reql.get(row('id')).replace((old) =>
            r.branch(old.ne(null), row,
             r.error(r.expr("The document with id '")
                      .add(row('id').coerceTo('string'))
                      .add("' was missing.")))));
      } else {
        fail(`'options.missing' and 'options.conflict' cannot both be 'error'.`);
      }
    } else {
      fail(`'options.missing' must be one of 'insert' or 'error'.`);
    }
    break;
  case 'remove':
    var ids = data.map((row) => {
        check(row.id !== undefined, `'options.data[i].id' must be specified for 'remove'.`);
        return row.id;
      });
    reql = reql.getAll(r.args(ids), { index: 'id' }).delete();
  }

  return reql;
};

const handle_write_response = (query, response, send_cb) => {
  if (response.errors !== 0) {
    send_cb({ error: response.first_error });
  } else {
    var index = 0;
    var ids = query.request.options.data.map((row) => {
        return row.id === undefined ? response.generated_keys[index++] : row.id;
      });
    send_cb({ data: ids, state: 'complete' });
  }
};

module.exports = { make_write_reql, handle_write_response };
