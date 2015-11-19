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

  const get_bound = (index, get_value, bound_value, cmp, extrema) => {
    const eval_key = (key) => {
      if (get_value && get_value[key] !== undefined) {
        if (bound_value && bound_value[key] !== undefined) {
          return cmp(bound_value[key], get_value[key]);
        } else {
          return get_value[key];
        }
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

  const lower_bound = (index, get_value, bound_value) =>
    get_bound(index, get_value, bound_value, r.max, r.minval);
  const upper_bound = (index, get_value, bound_value) =>
    get_bound(index, get_value, bound_value, r.min, r.maxval);

  const ordered_between = (obj) => {
    const optional_bound = (name) => options[name] && options[name][0];
    if (options.order) {
      let index = table.get_matching_index(Object.keys(obj), options.order[0]);
      let leftBound = options.above ? options.above[1] : 'closed';
      let rightBound = options.below ? options.below[1] : 'open';

      // TODO: would be nice if we could enforce this in the schema
      if (options.above) {
        Object.keys(options.above[0]).forEach((k) => check(index.fields.includes(k),
          `"above" contains a key not mentioned in "order": ${k}`));
      }
      if (options.below) {
        Object.keys(options.below[0]).forEach((k) => check(index.fields.includes(k),
          `"below" contains a key not mentioned in "order": ${k}`));
      }

      // TODO: this is using the wrong rightBound because we have to use the
      // user-specified bound if the least-significant 'below' field is used,
      // and 'closed' otherwise.  Maybe I screwed up the math, though, my brain is fried.
      return reql.orderBy({ index: index.name })
                 .between(lower_bound(index, obj, optional_bound('above')),
                          upper_bound(index, obj, optional_bound('below')),
                          { leftBound, rightBound: 'closed', index: index.name });
    } else {
      let index = table.get_matching_index(Object.keys(obj), [ ]);
      return reql.between(lower_bound(index, obj, { }),
                          upper_bound(index, obj, { }),
                          { rightBound: 'closed', index: index.name });
    }
  };

  if (options.find) {
    let index = table.get_matching_index(Object.keys(options.find), [ ]);
    reql = reql.between(lower_bound(index, options.find, { }),
                        upper_bound(index, options.find, { }),
                        { rightBound: 'closed', index: index.name });
  } else if (options.find_all) {
    // TODO: get this union mergesorted by the server once this is available
    reql = r.union.apply(r, options.find_all.map((obj) => ordered_between(obj)));
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
