'use strict';

const {reqlOptions, reads} = require('@horizon/plugin-utils');

function fetch(context) {
  return (req, res, next) => {
    const args = req.options.fetch;
    const permissions = req.getParameter('hz_permissions');
    const conn = context.horizon.rdbConnection.connection();

    if (args.length !== 0) {
      next(new Error(`"fetch" expects 0 arguments but found ${args.length}`));
    } else if (!permissions) {
      next(new Error('"fetch" requires permissions to run'));
    } else {
      reads.makeReadReql(req).then((reql) =>
        reql.run(conn, reqlOptions)
      ).then((result) => {
        if (result !== null && result.constructor.name === 'Cursor') {
          res.complete.then(() => {
            result.close().catch(() => { });
          });

          // TODO: reuse cursor batching
          return result.eachAsync((item) => {
            const validator = permissions();
            if (validator && !validator(req.clientCtx, item)) {
              next(new Error('Operation not permitted.'));
              result.close().catch(() => { });
            } else {
              res.write([item]);
            }
          }).then(() => {
            res.end();
          });
        } else {
          const validator = permissions();
          if (result !== null && result.constructor.name === 'Array') {
            for (const item of result) {
              if (validator && !validator(req.clientCtx, item)) {
                return next(new Error('Operation not permitted.'));
              }
            }
            res.end(result);
          } else if (validator && !validator(req.clientCtx, result)) {
            next(new Error('Operation not permitted.'));
          } else {
            res.end([result]);
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
