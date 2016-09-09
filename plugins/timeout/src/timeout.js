'use strict';

function timeout(req, res, next) {
  const args = req.options.timeout;
  if (args.length !== 1) {
    next(new Error(`"timeout" expected 1 argument but found ${args.length}`));
  } else if (typeof args[0] !== 'number') {
    next(new Error('timeout must be a number'));
  } else {
    req.setParameter(new Date(new Date().getTime() + args[0]));
    next();
  }
}

module.exports = {
  name: 'hz_timeout',
  activate: () => ({
    methods: {
      timeout: {
        type: 'option',
        handler: timeout,
      },
    },
  }),
};
