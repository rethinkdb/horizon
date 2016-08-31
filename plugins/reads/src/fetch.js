'use strict';

const common = require('./common');

module.exports = (server) => (req, res, next) => {
  const args = req.options.fetch;
  const permissions = req.getParameter('permissions');
  const conn = server.rdb_connection().connection();

  if (args.length !== 0) {
    next(new Error(`"fetch" expects 0 arguments but found ${args.length}`));
  } else if (!permissions) {
    next(new Error('"fetch" requires permissions to run'));
  } else {
    common.make_reql(server.r, req).then((reql) =>
      reql.run(conn, common.reql_options)
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
