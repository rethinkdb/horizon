'use strict';

const query = require('../schema/horizon_protocol').query;
const check = require('../error.js').check;
const reql_options = require('./common').reql_options;

const Joi = require('joi');
const r = require('rethinkdb');

const object_to_fields = (obj) =>
  Object.keys(obj).map((key) => {
    const value = obj[key];
    if (value !== null && typeof value === 'object' && !value['$reql_type$']) {
      return object_to_fields(value).map((subkeys) => [ key ].concat(subkeys));
    } else {
      return [ key ];
    }
  });

// This is exposed to be reused by 'subscribe'
const make_reql = (raw_request, metadata) => {
  const parsed = Joi.validate(raw_request.options, query);
  if (parsed.error !== null) { throw new Error(parsed.error.details[0].message); }
  const options = parsed.value;

  const collection = metadata.collection(parsed.value.collection);
  let reql = collection.table;

  const ordered_between = (obj) => {
    const fuzzy_fields = object_to_fields(obj);
    const order_keys = (options.order && options.order[0]) ||
                       (options.above && Object.keys(options.above[0])) ||
                       (options.below && Object.keys(options.below[0])) || [ ];

    if (order_keys.length >= 1) {
      const k = order_keys[0];
      check(!options.above || options.above[0][k] !== undefined,
            '"above" must be on the same field as the first in "order".');
      check(!options.below || options.below[0][k] !== undefined,
            '"below" must be on the same field as the first in "order".');
    }

    order_keys.forEach((k) => {
      check(obj[k] === undefined,
            `"${k}" cannot be used in "order", "above", or "below" when finding by that field.`);
    });

    const index = collection.get_matching_index(fuzzy_fields, order_keys.map((k) => [ k ]));

    const get_bound = (name) => {
      const eval_key = (key) => {
        if (obj[key] !== undefined) {
          return obj[key];
        } else if (options[name] && options[name][0][key] !== undefined) {
          return options[name][0][key];
        } else if (options[name] && options[name][1] === 'open') {
          return name === 'above' ? r.maxval : r.minval;
        } else {
          return name === 'above' ? r.minval : r.maxval;
        }
      };

      if (index.name === 'id') {
        return eval_key('id');
      }
      return index.fields.map((k) => eval_key(k));
    };

    const above_value = get_bound('above');
    const below_value = get_bound('below');

    const optargs = {
      index: index.name,
      leftBound: options.above ? options.above[1] : 'closed',
      rightBound: options.below ? options.below[1] : 'closed',
    };

    const order = (options.order && options.order[1] === 'descending') ?
      r.desc(index.name) : index.name;
    return reql.orderBy({ index: order }).between(above_value, below_value, optargs);
  };

  if (options.find) {
    reql = ordered_between(options.find).limit(1);
  } else if (options.find_all && options.find_all.length > 1) {
    reql = r.union.apply(r, options.find_all.map((x) => ordered_between(x)));
  } else {
    reql = ordered_between((options.find_all && options.find_all[0]) || { });
  }

  if (options.limit !== undefined) {
    reql = reql.limit(options.limit);
  }

  return reql;
};

const run = (raw_request, context, ruleset, metadata, send, done) => {
  let cursor;
  const reql = make_reql(raw_request, metadata);

  reql.run(metadata.connection(), reql_options).then((res) => {
    if (res !== null && res.constructor.name === 'Cursor') {
      cursor = res;
      return cursor.eachAsync((item) => {
        if (!ruleset.validate(context, item)) {
          done(new Error('Operation not permitted.'));
          cursor.close().catch(() => { });
        } else {
          send({ data: [ item ] });
        }
      }).then(() => {
        done({ data: [ ], state: 'complete' });
      });
    } else if (res !== null && res.constructor.name === 'Array') {
      for (const item of res) {
        if (!ruleset.validate(context, item)) {
          return done(new Error('Operation not permitted.'));
        }
      }
      done({ data: res, state: 'complete' });
    } else if (!ruleset.validate(context, res)) {
      done(new Error('Operation not permitted.'));
    } else {
      done({ data: [ res ], state: 'complete' });
    }
  }).catch(done);

  return () => {
    if (cursor) {
      cursor.close().catch(() => { });
    }
  };
};

module.exports = { make_reql, run };
