'use strict';

const assert = require('assert');

const {r} = require('@horizon/server');

// For a given object, returns the array of fields present
function objectToFields(obj) {
  return Object.keys(obj).map((key) => {
    const value = obj[key];
    if (value !== null && typeof value === 'object' && !value.$reql_type$) {
      return object_to_fields(value).map((subkeys) => [key].concat(subkeys));
    } else {
      return [key];
    }
  });
}

// Gets the value of a field out of an object, or undefined if it is not present
function getObjectField(obj, field) {
  let value = obj;
  for (const name of field) {
    if (value === undefined) {
      return value;
    }
    value = value[name];
  }
  return value;
}

// Gets the value of a field out of an object, throws an error if it is not present
function guaranteeObjectField(obj, field) {
  const res = getObjectField(obj, field);
  assert(res !== undefined);
  return res;
}

// Compares two fields, returns true if they are identical, false otherwise
function isSameField(a, b) {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < b.length; ++i) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

// Returns true if the expected field is in the array of fields
function hasField(fields, expected) {
  for (let i = 0; i < fields.length; ++i) {
    if (isSameField(fields[i], expected)) {
      return true;
    }
  }
}

function makeFindReql(collection, find) {
  return collection.getMatchingIndex(objectToFields(find), []).then((index) => {
    let value = index.fields.map((field) => guaranteeObjectField(find, field));

    if (index.name === 'id') {
      value = value[0];
    }

    return collection.table.getAll(value, {index: index.name}).limit(1);
  });
}

function getIndexValue(field, obj, bound, def) {
  let value = getObjectField(obj, field);
  if (value !== undefined) { return value; }
  value = getObjectField(bound, field);
  if (value !== undefined) { return value; }
  return def;
}

function makeFindAllReql(collection, findAll, fixedFields, above, below, descending) {
  return Promise.all(findAll.map((obj) => {
    const fuzzyFields = objectToFields(obj);
    // RSI: make sure fuzzyFields and fixedFields overlap only in the correct spot
    // RSI: come up with some pathological tests that hit these sorts of cases

    return collection.getMatchingIndex(fuzzyFields, fixedFields).then((index) => {
      const optargs = {
        index: index.name,
        leftBound: above ? above.bound : 'closed',
        rightBound: below ? below.bound : 'closed',
      };

      let defaultLeftBound = r.minval;
      let defaultRightBound = r.maxval;

      if (above && above.bound === 'open') { defaultLeftBound = r.maxval; }
      if (below && below.bound === 'closed') { defaultRightBound = r.maxval; }

      let leftValue = index.fields.map((field) =>
        getIndexValue(field, obj, above && above.value, defaultLeftBound));
      let rightValue = index.fields.map((field) =>
        getIndexValue(field, obj, below && below.value, defaultRightBound));

      if (index.name === 'id') {
        leftValue = leftValue[0];
        rightValue = rightValue[0];
      }

      return collection.table
        .orderBy({index: descending ? r.desc(index.name) : index.name})
        .between(leftValue || r.minval, rightValue || r.maxval, optargs);
    });
  })).then((subqueries) => {
    return r.union(...subqueries);
  });
}

function makeTableScanReql(collection, fixedFields, above, below, descending) {
  return collection.getMatchingIndex([], fixedFields).then((index) => {
    let leftValue, rightValue;
    const optargs = {index: index.name};

    if (above) {
      const defaultLeftBound = above.bound === 'closed' ? r.minval : r.maxval;
      leftValue = index.fields.map((field) => getIndexValue(field, {}, above.value, defaultLeftBound));
      optargs.leftBound = above.bound;
    }
    if (below) {
      const defaultRightBound = below.bound === 'closed' ? r.maxval : r.minval;
      rightValue = index.fields.map((field) => getIndexValue(field, {}, below.value, defaultRightBound));
      optargs.rightBound = below.bound;
    }

    if (index.name === 'id') {
      if (leftValue) { leftValue = leftValue[0]; }
      if (rightValue) { rightValue = rightValue[0]; }
    }

    let reql = collection.table.orderBy({index: descending ? r.desc(index.name) : index.name});
    if (leftValue || rightValue) {
      reql = reql.between(leftValue || r.minval, rightValue || r.maxval, optargs);
    }
    return reql;
  });
}

function makeReadReql(req) {
  return Promise.resolve().then(() => {
    const collection = req.getParameter('collection');
    const findAll = req.getParameter('findAll');
    const find = req.getParameter('find');

    assert(!find || !findAll);

    if (!collection) {
      throw new Error('"collection" was not specified.');
    }

    if (find) {
      return makeFindReql(collection, find);
    } else {
      const order = req.getParameter('order');
      const above = req.getParameter('above');
      const below = req.getParameter('below');
      const descending = Boolean(order && order.descending);

      const orderFields = order ? order.fields : [];

      if (above) {
        if (order) {
          if (!isSameField(above.field, orderFields[0])) {
            throw new Error('"above" must be on the same field as the first in "order".');
          }
        } else {
          orderFields.push(above.field);
        }
      }

      if (below) {
        if (order || above) {
          if (!isSameField(below.field, orderFields[0])) {
            throw new Error('"below" must be on the same field as ' +
                            (order ? 'the first in "order"' : '"above"'));
          }
        } else {
          orderFields.push(below.field);
        }
      }

      let reql_promise;
      if (findAll) {
        reql_promise = makeFindAllReql(collection, findAll, orderFields, above, below, descending);
      } else {
        reql_promise = makeTableScanReql(collection, orderFields, above, below, descending);
      }

      const limit = req.getParameter('limit');
      return limit === undefined ?
        reql_promise : reql_promise.then((reql) => reql.limit(limit));
    }
  });
}

module.exports = {makeReadReql, objectToFields};
