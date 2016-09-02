'use strict';

const utils = require('./common/utils');
const common = require('./common/writes');
const hz_v = utils.versionField;

const {r} = require('@horizon/server');

function store(ctx) {
  return (request, response, next) => {
    const conn = ctx.rdb_connection().connection();
    const timeout = request.getParameter('timeout');
    const collection = request.getParameter('collection');
    const permissions = request.getParameter('hz_permissions');

    if (!collection) {
      throw new Error('No collection given for insert operation.');
    } else if (!permissions) {
      throw new Error('No permissions given for insert operation.');
    }

    common.retry_loop(request.options.store, permissions, timeout,
      (rows) => // pre-validation, all rows
        r.expr(rows.map((row) => (row.id === undefined ? null : row.id)))
          .map((id) => r.branch(id.eq(null), null, collection.table.get(id)))
          .run(conn, utils.reqlOptions),
      (validator, row, info) =>
        common.validate_old_row_optional(validator, request.clientCtx, row, info, row),
      (rows) => // write to database, all valid rows
        r.expr(rows)
          .forEach((new_row) =>
            r.branch(new_row.hasFields('id'),
                     collection.table.get(new_row('id')).replace((old_row) =>
                         r.branch(
                           old_row.eq(null),
                           r.branch(
                             // Error if we were expecting the row to exist
                             new_row.hasFields(hz_v),
                             r.error(common.invalidated_msg),

                             // Otherwise, insert the row
                             common.apply_version(new_row, 0)
                           ),
                           r.branch(
                             // The row may have changed from the expected version
                             r.and(new_row.hasFields(hz_v),
                                   old_row(hz_v).default(-1).ne(new_row(hz_v))),
                             r.error(common.invalidated_msg),

                             // Otherwise, we can overwrite the row
                             common.apply_version(new_row,
                                                  old_row(hz_v).default(-1).add(1))
                           )
                         ), {returnChanges: 'always'}),

                     // The new row does not have an id, so it will autogenerate
                     collection.table.insert(common.apply_version(new_row, 0),
                                             {returnChanges: 'always'})))
          .run(conn, utils.reqlOptions)
    ).then((msg) => response.end(msg)).catch(next);
  };
}

module.exports = () => ({
  name: 'hz_store',
  activate: (ctx) => ({
    methods: {
      store: {
        type: 'terminal',
        requires: ['hz_permissions'],
        handler: store(ctx),
      },
    },
  }),
});
