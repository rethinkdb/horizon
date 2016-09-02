'use strict';

const common = require('./common');

function watch(server) {
  return (req, res, next) => {
    const args = req.options.watch;
    const permissions = req.getParameter('hz_permissions');
    const conn = server.rdb_connection().connection();

    if (args.length !== 0) {
      next(new Error(`"watch" expects 0 arguments but found ${args.length}`));
    } else if (!permissions) {
      next(new Error('"watch" requires permissions to run'));
    } else {
      common.make_reql(req).then((reql) =>
          reql.changes({
          include_initial: true,
          include_states: true,
          include_types: true,
          include_offsets:
            req.getParameter('order') !== undefined &&
            req.getParameter('limit') !== undefined,
        }).run(conn, common.reql_options)
      ).then((feed) => {
        res.complete.then(() => {
          feed.close().catch(() => { });
        });

        // TODO: reuse cursor batches
        return feed.eachAsync((item) => {
          if (item.state === 'initializing') {
            // Do nothing - we don't care
          } else if (item.state === 'ready') {
            res.write([], 'synced');
          } else {
            const validator = permissions();
            if (validator) {
              if ((item.old_val && !validator(req.clientCtx, item.old_val)) ||
                  (item.new_val && !validator(req.clientCtx, item.new_val))) {
                next(new Error('Operation not permitted.'));
              }
            }
            res.write([item]);
          }
        });
      }).then(() => res.end()).catch(next);
    }
  };
}

module.exports = () => ({
  name: 'hz_watch',
  activate: (ctx) => ({
    methods: {
      watch: {
        type: 'terminal',
        requires: ['hz_permissions'],
        handler: watch(ctx),
      },
    },
  }),
});
