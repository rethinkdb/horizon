'use strict';

function legalField(value) {
  return typeof value === 'string' ||
    (Array.isArray(value) && value.every((i) => typeof i === 'string'));
}

function convertField(value) {
  return typeof value === 'string' ? [value] : value;
}

function order(req, res, next) {
  const args = req.options.order;
  if (args.length < 1 || args.length > 2) {
    next(new Error(`"order" expected 1 or 2 arguments but found ${args.length}.`));
  } else if (!Array.isArray(args[0]) && typeof args[0] !== 'string') {
    next(new Error('First argument to "order" must be an array or string.'));
  } else if (Array.isArray(args[0]) && !args[0].every(legalField)) {
    next(new Error('First argument to "order" must be a string or ' +
                   'an array of strings or arrays of strings.'));
  } else if (args.length === 2 &&
             (args[1] !== 'ascending' && args[1] !== 'descending')) {
    next(new Error('Second argument to "order" must be "ascending" or "descending".'));
  } else {
    req.setParameter({
      fields: Array.isArray(args[0]) ?
        args[0].map(convertField) : [convertField(args[0])],
      descending: args.length === 1 ? false : (args[1] === 'descending'),
    });
    next();
  }
}

module.exports = {
  name: 'hz_order',
  activate: () => ({
    methods: {
      order: {
        type: 'option',
        handler: order,
      },
    },
  }),
};
