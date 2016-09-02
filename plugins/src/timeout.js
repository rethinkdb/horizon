'use strict';

module.exports = (raw_config) => ({
  name: (raw_config && raw_config.name) || 'hz_timeout',
  activate: () => ({
    methods: ({
      timeout: {
        type: 'option',
        handler: (req, res, next) => {
          const args = req.options.timeout;
          if (args.length !== 1) {
            next(new Error(`"timeout" expected 1 argument but found ${args.length}`));
          } else if (typeof args[0] !== 'number') {
            next(new Error('timeout must be a number'));
          } else {
            req.setParameter(new Date() + args[0]);
            next();
          }
        },
      },
    }),
  }),
});
