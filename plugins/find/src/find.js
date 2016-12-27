'use strict';

const {isObject, isValidIndex} = require('@horizon/plugin-utils');

function find(req, res, next) {
  const args = req.options.find;
  if (args.length !== 1) {
    next(new Error(`"find" expected 1 argument but found ${args.length}.`));
  } else if (req.options.findAll ||
             req.options.limit ||
             req.options.order ||
             req.options.above ||
             req.options.below) {
    next(new Error('"find" cannot be used with ' +
                   '"findAll", "limit", "order", "above", or "below"'));
  } else {
    const predicate = args[0];
    if (isObject(predicate)) {
      if (Object.keys(predicate).length === 0) {
        next(new Error('"find" object must have at least 1 field.'));
      } else {
        req.setParameter(predicate);
        next();
      }
    } else if (isValidIndex(predicate)) {
      req.setParameter({id: predicate});
      next();
    } else {
      next(new Error('"find" argument is not an object or valid index value.'));
    }
  }
}

module.exports = {
  name: 'hz_find',
  activate: () => ({
    methods: {
      find: {
        type: 'option',
        handler: find,
      },
    },
  }),
};
