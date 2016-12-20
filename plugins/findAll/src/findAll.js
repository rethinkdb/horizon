'use strict';

const {isObject, isValidIndex} = require('@horizon/plugin-utils');

function findAll(req, res, next) {
  const args = req.options.findAll;
  if (args.length < 1) {
    next(new Error(`"findAll" expected 1 or more arguments but found ${args.length}.`));
  } else if (req.options.find) {
    next(new Error('"findAll" cannot be used with "find"'));
  } else {
    let invalidArg;
    const predicate = args.map((item, index) => {
      if (isObject(item)) {
        return item;
      } else if (isValidIndex(item)) {
        return {id: item}
      } else {
        invalidArg = index;
      }
    });

    if (invalidArg === undefined) {
      req.setParameter(predicate);
      next();
    } else {
      next(new Error(`"findAll" argument ${invalidArg} is not an object or valid index value.`));
    }
  }
}

module.exports = {
  name: 'hz_findAll',
  activate: () => ({
    methods: {
      findAll: {
        type: 'option',
        handler: findAll,
      },
    },
  }),
};
