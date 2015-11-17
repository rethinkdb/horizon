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
  let reql = r.table(options.collection);

  // TODO: use fuzzy index matching once the server supports sindex with missing fields
  // TODO: or we could maybe workaround it with sindex functions that use .default(r.minval)
  const ordered_between = (obj) => {
    if (options.order) {
      let index = metadata.get_exact_index(obj.keys(), options.order[0]);
      let bounds = { above: r.minval, below: r.maxval };
      let bound_types = { };

      const add_bound = (opt_name, reql_optarg, extrema) => {
        if (options[opt_name]) {
          bound_types[reql_optarg] = options[opt_name][1];
          // TODO: would be nice if we could enforce this in the schema
          options[opt_name][0].keys().forEach((k) => check(index.fields.includes(k),
            `"above" contains a key not mentioned in "order": ${k}`));
          bounds[opt_name] = index.fields.map((k) => {
            return options[opt_name][k] !== undefined ?
              options[opt_name][k] : extrema;
          });
        }
      };

      add_bound('above', 'leftBound', r.minval);
      add_bound('below', 'rightBound', r.maxval);

      return reql.orderBy({ index: index.name })
                 .between(bounds.above, bounds.below, bound_types);
    } else {
      let index = metadata.get_exact_index(obj.keys());
      return reql.between(index.fields.map((k) => obj[k]),
                          index.fields.map((k) => obj[k]),
                          { index: index.name });
    }
  };

  if (options.find) {
    let index = metadata.get_exact_index(options.find.keys());
    let value = index.fields.map((k) => options.find[k]);
    reql = reql.getAll(value, { index: index.name });
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

// All queries result in a cursor response
const handle_response = (request, cursor, send_cb) => {
  request.add_cursor(cursor);
  cursor.each((err, item) => {
    if (err !== null) {
      send_cb({ error: `${err}` });
    } else {
      send_cb({ data: [ item ] });
    }
  }, () => {
    request.remove_cursor();
    send_cb({ data: [ ], state: 'complete' });
  });
};

module.exports = { make_reql, handle_response };
