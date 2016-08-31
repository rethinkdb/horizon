'use strict';

const reql_options = {
  timeFormat: 'raw',
  binaryFormat: 'raw',
};

function isObject(x) {
  return !Array.isArray(x) && x !== null;
}

function object_to_fields(obj) {
  return Object.keys(obj).map((key) => {
    const value = obj[key];
    if (value !== null && typeof value === 'object' && !value.$reql_type$) {
      return object_to_fields(value).map((subkeys) => [key].concat(subkeys));
    } else {
      return [key];
    }
  });
}

// This is exposed to be reused by 'subscribe'
const make_reql = (r, req) => Promise.resolve().then(() => {
  const find = req.getParameter('find');
  const limit = req.getParameter('limit');
  const order = req.getParameter('order');
  const above = req.getParameter('above');
  const below = req.getParameter('below');
  const findAll = req.getParameter('findAll');
  const collection = req.getParameter('collection');

  if (!collection) {
    throw new Error('"collection" was not specified.');
  } else if (find && findAll) {
    throw new Error('Cannot specify both "find" and "findAll".');
  } else if (find && (limit || order || above || below)) {
    throw new Error('Cannot specify "find" with "limit", "order", "above", or "below".');
  } else if ((above || below) && !order) {
    throw new Error('Cannot specify "above" or "below" without "order".');
  }

  const order_keys = (order && order[0]) || [];
  let aboveKeyCount = above ? Object.keys(above[0]).length : 0;
  let belowKeyCount = below ? Object.keys(below[0]).length : 0;
  order_keys.forEach((k) => {
    if (above) {
      if (above[0][k] !== undefined) {
        aboveKeyCount -= 1;
      } else if (aboveKeyCount !== 0) {
        throw new Error('The keys in "above" must appear continguously ' +
                         'from the start of "order".');
      }
    }
    if (below) {
      if (below[0][k] !== undefined) {
        belowKeyCount -= 1;
      } else if (belowKeyCount !== 0) {
        throw new Error('The keys in "below" must appear continguously ' +
                         'from the start of "order".');
      }
    }
  });

  if (aboveKeyCount !== 0) {
    throw new Error('The keys in "above" must all appear in "order".');
  } else if (belowKeyCount !== 0) {
    throw new Error('The keys in "below" must all appear in "order".');
  }

  // RSI: this is all wrong
  const ordered_between = (obj) => Promise.resolve().then(() => {
    const fuzzy_fields = object_to_fields(obj);
    return collection.get_matching_index(fuzzy_fields, order_keys);
  }).then((index) => {
    order_keys.forEach((k) => {
      if (obj[k] !== undefined) {
        throw new Error(`"${k}" cannot be used in "order", "above", or "below" ` +
                        'when finding by that field.');
      }
    });

    const get_bound = (option) => {
      const eval_key = (key) => {
        if (obj[key] !== undefined) {
          return obj[key];
        } else if (option && option[0][key] !== undefined) {
          return option[0][key];
        } else if (option && option[1] === 'open') {
          return option === above ? r.maxval : r.minval;
        } else {
          return option === above ? r.minval : r.maxval;
        }
      };

      if (index.name === 'id') {
        return eval_key('id');
      }
      return index.fields.map((k) => eval_key(k));
    };

    const above_value = get_bound(above);
    const below_value = get_bound(below);

    const optargs = {
      index: index.name,
      leftBound: above ? above[1] : 'closed',
      rightBound: below ? below[1] : 'closed',
    };

    return collection.table.orderBy({
      index: order && order[1] === 'descending' ? r.desc(index.name) : index.name,
    }).between(above_value || r.minval, below_value || r.maxval, optargs);
  });

  let reqlPromise;
  if (find) {
    reqlPromise = ordered_between(find).then((subquery) => subquery.limit(1));
  } else if (findAll && findAll.length > 1) {
    reqlPromise = Promise.all(findAll.map((x) => ordered_between(x))).then((subqueries) =>
      r.union.apply(subqueries));
  } else {
    reqlPromise = ordered_between((findAll && findAll[0]) || {});
  }

  return reqlPromise.then((reql) =>
    limit !== undefined ? reql.limit(limit) : reql;
  );
});

module.exports = {make_reql, isObject, reql_options};
