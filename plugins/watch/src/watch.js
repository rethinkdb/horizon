'use strict';

const {reqlOptions, reads} = require('@horizon/plugin-utils');

function watch(context) {
  return (req, res, next) => {
    const args = req.options.watch;
    const permissions = req.getParameter('hz_permissions');
    const conn = context.horizon.rdbConnection.connection();

    if (args.length !== 0) {
      next(new Error(`"watch" expects 0 arguments but found ${args.length}`));
    } else if (!permissions) {
      next(new Error('"watch" requires permissions to run'));
    } else {
      reads.makeReadReql(req).then((reql) =>
        reql.changes({
          include_initial: true,
          include_states: true,
          include_types: true,
          include_offsets:
            req.getParameter('order') !== undefined &&
            req.getParameter('limit') !== undefined,
        }).run(conn, reqlOptions)
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
              if ((item.old_val && !validator(item.old_val)) ||
                  (item.new_val && !validator(item.new_val))) {
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

module.exports = {
  name: 'hz_watch',
  activate: (context) => ({
    methods: {
      watch: {
        type: 'terminal',
        requires: ['hz_permissions'],
        handler: watch(context),
      },
    },
  }),
};
