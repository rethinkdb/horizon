'use strict';

const utils = require('./common/utils');
const common = require('./common/reads');

function fetch(ctx) {
  return (req, res, next) => {
    const args = req.options.fetch;
    const permissions = req.getParameter('hz_permissions');
    const conn = ctx.rdb_connection().connection();

    if (args.length !== 0) {
      next(new Error(`"fetch" expects 0 arguments but found ${args.length}`));
    } else if (!permissions) {
      next(new Error('"fetch" requires permissions to run'));
    } else {
      common.make_reql(req).then((reql) =>
        reql.run(conn, utils.reqlOptions)
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

module.exports = () => ({
  name: 'hz_fetch',
  activate: (ctx) => ({
    methods: {
      fetch: {
        type: 'terminal',
        requires: ['hz_permissions'],
        handler: fetch(ctx),
      },
    },
  }),
});
