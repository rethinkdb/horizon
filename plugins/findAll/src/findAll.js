'use strict';

const {isObject} = require('@horizon/plugin-utils');

function findAll(req, res, next) {
  const args = req.options.findAll;
  if (args.length < 1) {
    next(new Error(`"findAll" expected 1 or more arguments but found ${args.length}.`));
  } else if (!args.every((val) => isObject(val))) {
    next(new Error('All arguments to "findAll" must be objects.'));
  } else if (req.options.find) {
    next(new Error('"findAll" cannot be used with "find"'));
  } else {
    req.setParameter(args);
    next();
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
