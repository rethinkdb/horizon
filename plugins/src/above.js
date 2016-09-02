'use strict';

const {isObject} = require('./common/utils');

function above(req, res, next) {
  const args = req.options.above;
  if (args.length < 1 || args.length > 2) {
    next(new Error(`"above" expected 1 or 2 arguments but found ${args.length}.`));
  } else if (!isObject(args[0]) && typeof args[0] !== 'string') {
    next(new Error('First argument to "above" must be a string or object.'));
  } else if (args.length === 2 && (args[1] !== 'open' && args[1] !== 'closed')) {
    next(new Error('Second argument to "above" must be "open" or "closed"'));
  } else {
    req.setParameter({value: args[0], bound: args.length === 1 ? 'open' : args[1]});
    next();
  }
}

module.exports = (options) => ({
  name: 'hz_above',
  activate: (ctx) => ({
    methods: {
      above: {
        type: 'option',
        handler: above,
      },
    },
  }),
});
