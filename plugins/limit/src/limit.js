'use strict';

function limit(req, res, next) {
  const args = req.options.limit;
  if (args.length !== 1) {
    next(new Error(`"limit" expected 1 argument but found ${args.length}.`));
  } else if (typeof args[0] !== 'number') {
    next(new Error('First argument to "limit" must be a number.'));
  } else {
    req.setParameter(args[0]);
    next();
  }
}

module.exports = {
  name: 'hz_limit',
  activate: () => ({
    methods: {
      limit: {
        type: 'option',
        handler: limit,
      },
    },
  }),
};
