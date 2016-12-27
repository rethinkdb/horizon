'use strict';

const {isObject, isValidIndex} = require('@horizon/plugin-utils');

function findAll(req, res, next) {
  const args = req.options.findAll;
  if (args.length < 1) {
    next(new Error(`"findAll" expected 1 or more arguments but found ${args.length}.`));
  } else if (req.options.find) {
    next(new Error('"findAll" cannot be used with "find"'));
  } else {
    let err;
    const predicate = args.map((item, index) => {
      if (isObject(item)) {
        if (Object.keys(item).length === 0) {
          err = `"findAll" argument ${index} object must have at least 1 field.`;
        } else {
          return item;
        }
      } else if (isValidIndex(item)) {
        return {id: item};
      } else {
        err = `"findAll" argument ${index} is not an object or valid index value.`;
      }
    });

    if (err) {
      next(new Error(err));
    } else {
      req.setParameter(predicate);
      next();
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
