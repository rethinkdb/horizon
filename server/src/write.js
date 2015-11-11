'use strict';

const { check, fail } = require('./error');
const fusion_protocol = require('./schema/fusion_protocol');

const Joi = require('joi');
const r = require('rethinkdb');

const make_update_reql = (request) => {
  var { data, collection } = Joi.attempt(request.options, fusion_protocol.update);
  return r.expr(data).forEach((row) =>
        r.table(collection).get(row('id')).replace((old) =>
         r.branch(old.ne(null), old.merge(row),
           r.error(r.expr("The document with id '")
                    .add(row('id').coerceTo('string'))
                    .add("' was missing.")))));
}

const make_replace_reql = (request) => {
  var { data, collection } = Joi.attempt(request.options, fusion_protocol.replace);
  return r.expr(data).forEach((row) =>
        r.table(collection).get(row('id')).replace((old) =>
          r.branch(old.ne(null), row,
           r.error(r.expr("The document with id '")
                    .add(row('id').coerceTo('string'))
                    .add("' was missing.")))));
}

const make_insert_reql = (request) => {
  var { data, collection } = Joi.attempt(request.options, fusion_protocol.insert);
  return r.table(collection).insert(data, { conflict: 'error' });
}

const make_upsert_reql = (request) => {
  var { data, collection } = Joi.attempt(request.options, fusion_protocol.upsert);
  return r.table(collection).insert(data, { conflict: 'update' });
}

const make_store_reql = (request) => {
  var { data, collection } = Joi.attempt(request.options, fusion_protocol.store);
  return r.table(collection).insert(data, { conflict: 'replace' });
}

const make_remove_reql = (request) => {
  var { data, collection } = Joi.attempt(request.options, fusion_protocol.remove);
  return r.table(collection)
          .getAll(r.args(data.map((row) => row.id)), { index: 'id' })
          .delete();
}

const handle_write_response = (query, response, send_cb) => {
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

module.exports = {
  make_store_reql,
  make_insert_reql,
  make_update_reql,
  make_upsert_reql,
  make_replace_reql,
  make_remove_reql,
  handle_write_response
};
