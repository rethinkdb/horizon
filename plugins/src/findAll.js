'use strict';

const isObject = require('./common').isObject;

function findAll(req, res, next) {
  const args = req.options.findAll;
  if (args.length < 1) {
    next(new Error(`"findAll" expected 1 or more arguments but found ${args.length}.`));
  } else if (!args.every((val) => isObject(val))) {
    next(new Error('All arguments to "findAll" must be objects.'));
  } else {
    req.setParameter(args);
    next();
  }
}

module.exports = () => ({
  name: 'hz_findAll',
  activate: (ctx) => ({
    methods: {
      findAll: {
        type: 'option',
        handler: findAll,
      },
    },
  }),
});
