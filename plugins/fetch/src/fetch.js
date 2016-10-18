'use strict';

const {reqlOptions, reads} = require('@horizon/plugin-utils');

function fetch(context) {
  return (req, res, next) => {
    const args = req.options.fetch;
    const permissions = req.getParameter('hz_permissions');

    if (args.length !== 0) {
      next(new Error(`"fetch" expects 0 arguments but found ${args.length}`));
    } else if (!permissions) {
      next(new Error('"fetch" requires permissions to run'));
    } else {
      reads.makeReadReql(req).then((reql) =>
        reql.run(context.horizon.conn(), reqlOptions)
      ).then((result) => {
        if (result !== null && result.constructor.name === 'Cursor') {
          const cleanup = () => result.close().catch(() => {});
          res.complete.then(cleanup).catch(cleanup);

          // RSI: utility functions to make this easier?
          res.write({op: 'replace', path: '',
                     value: {type: 'value', synced: false, val: []}});

          // TODO: reuse cursor batching
          return result.eachAsync((item) => {
            const validator = permissions();
            if (validator && !validator(item)) {
              next(new Error('Operation not permitted.'));
              cleanup();
            } else {
              res.write({op: 'add', path: '/val/-', value: item});
            }
          }).then(() => {
            res.end({op: 'replace', path: '/synced', value: true});
          });
        } else {
          const validator = permissions();
          if (result !== null && result.constructor.name === 'Array') {
            if (validator) {
              for (const item of result) {
                if (!validator(item)) {
                  throw new Error('Operation not permitted.');
                }
              }
            }
            res.end({op: 'replace', path: '',
                     value: {type: 'value', synced: true, val: result}});
          } else if (validator && !validator(result)) {
            next(new Error('Operation not permitted.'));
          } else {
            res.end({op: 'replace', path: '',
                     value: {type: 'value', synced: true, val: result}});
          }
        }
      }).catch(next);
    }
  };
}

module.exports = {
  name: 'hz_fetch',
  activate: (context) => ({
    methods: {
      fetch: {
        type: 'terminal',
        requires: ['hz_permissions'],
        handler: fetch(context),
      },
    },
  }),
};
