'use strict';

const { query } = require('../schema/fusion_protocol');
const { check } = require('../error.js');

const Joi = require('joi');
const r = require('rethinkdb');

// This is also used by the 'subscribe' endpoint
const make_reql = (raw_request, metadata) => {
  const { value: options, error } = Joi.validate(raw_request.options, query);
  if (error !== null) { throw new Error(error.details[0].message); }

  // Construct a set of all fields we need to index by
  // The `get_fields` can be in any order, but the `order_fields` are strict
  const table = metadata.get_table(options.collection);
  let reql = r.table(table.name);

  const ordered_between = (obj) => {
    const optional_bound = (name) => (options[name] && options[name][0]) || { };
    const index = table.get_matching_index(Object.keys(obj),
      (options.order && options.order[0]) || [ ]);
    let sub_reql = reql;
    if (options.order) {
      sub_reql = sub_reql.orderBy({ index:
         options.order[1] === 'ascending' ? index.name : r.desc(index.name) });
    }

    const get_bound = (bound_value, extrema) => {
      const eval_key = (key) => {
        if (obj[key] !== undefined) {
          check(!bound_value || bound_value[key] === undefined,
                ``);
          return obj[key];
        } else if (bound_value && bound_value[key] !== undefined) {
          return bound_value[key];
        }
        return extrema;
      };

      if (index.name === 'id') {
        return eval_key('id');
      }
      return index.fields.map((k) => eval_key(k));
    };

    // TODO: check that the above/below specifies the right key

    const above_value = get_bound(optional_bound('above'), r.minval);
    const below_value = get_bound(optional_bound('below'), r.maxval);

    const optargs = { index: index.name,
      leftBound: options.above ? options.above[1] : 'closed',
      rightBound: options.below ? options.below[1] : 'closed', };

    return sub_reql.between(above_value, below_value, optargs);
  };

  if (options.find) {
    reql = ordered_between(options.find);
  } else if (options.find_all) {
    if (options.find_all.length > 1) {
      reql = r.union.apply(r, options.find_all.map((x) => ordered_between(x)));
    } else {
      reql = ordered_between(options.find_all[0]);
    }
  } else {
    reql = ordered_between({});
  }

  if (options.find || options.limit) {
    reql = reql.limit(options.find ? 1 : options.limit);
  }

  return reql;
};

const handle_response = (request, res, send_cb) => {
  if (res.constructor.name === 'Cursor') {
    request.add_cursor(res);
    res.each((err, item) => {
      if (err !== null) {
        send_cb({ error: `${err}` });
      } else {
        send_cb({ data: [ item ] });
      }
    }, () => {
      request.remove_cursor();
      send_cb({ data: [ ], state: 'complete' });
    });
  } else {
    check(res.constructor.name === 'Array', `Query got a non-array, non-cursor result`);
    send_cb({ data: res, state: 'complete' });
  }
};

module.exports = { make_reql, handle_response };
