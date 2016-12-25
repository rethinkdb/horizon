'use strict';

const {isObject, reads} = require('@horizon/plugin-utils');
const {objectToFields} = reads;

function below(req, res, next) {
  const args = req.options.below;
  if (args.length < 1 || args.length > 2) {
    next(new Error(`"below" expected 1 or 2 arguments but found ${args.length}.`));
  } else if (args.length === 2 && (args[1] !== 'open' && args[1] !== 'closed')) {
    next(new Error('Second argument to "below" must be "open" or "closed".'));
  } else {
    const bound = args.length === 1 ? 'open' : args[1];
    if (isObject(args[0])) {
      const fields = objectToFields(args[0]);
      if (fields.length !== 1) {
        next(new Error('Object argument to "below" must have exactly one field.'));
      } else {
        req.setParameter({field: fields[0], value: args[0], bound});
        next();
      }
    } else if (typeof args[0] === 'string') {
      req.setParameter({field: ['id'], value: {id: args[0]}, bound});
      next();
    } else {
      next(new Error('First argument to "below" must be a string or object.'));
    }
  }
}

module.exports = {
  name: 'hz_below',
  activate: () => ({
    methods: {
      below: {
        type: 'option',
        handler: below,
      },
    },
  }),
};
