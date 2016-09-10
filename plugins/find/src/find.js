'use strict';

const {isObject} = require('@horizon/plugin-utils');

function find(req, res, next) {
  const args = req.options.find;
  if (args.length !== 1) {
    next(new Error(`"find" expected 1 argument but found ${args.length}.`));
  } else if (!isObject(args[0])) {
    next(new Error('First argument to "find" must be an object.'));
  } else if (req.options.findAll ||
             req.options.limit ||
             req.options.order ||
             req.options.above ||
             req.options.below) {
    next(new Error('"find" cannot be used with ' +
                   '"findAll", "limit", "order", "above", or "below"'));
  } else {
    req.setParameter(args[0]);
    next();
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
