'use strict';

const {r} = require('@horizon/server');
const {reqlOptions, writes, versionField: hz_v} = require('@horizon/plugin-utils');

function upsert(context) {
  return (request, response, next) => {
    const conn = context.horizon.rdbConnection.connection();
    const timeout = request.getParameter('timeout');
    const collection = request.getParameter('collection');
    const permissions = request.getParameter('hz_permissions');

    if (!collection) {
      throw new Error('No collection given for insert operation.');
    } else if (!permissions) {
      throw new Error('No permissions given for insert operation.');
    }

    writes.retry_loop(request.options.upsert, permissions, timeout,
      (rows) => // pre-validation, all rows
        r.expr(rows)
          .map((new_row) =>
            r.branch(new_row.hasFields('id'),
                     collection.table.get(new_row('id')).do((old_row) =>
                       r.branch(old_row.eq(null),
                                [null, new_row],
                                [old_row, old_row.merge(new_row)])),
                     [null, new_row]))
          .run(conn, reqlOptions),
      (validator, row, info) =>
        writes.validate_old_row_optional(
          validator, request.clientCtx, row, info[0], info[1]),
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
                             r.error(writes.invalidated_msg),

                             // Otherwise, insert the row
                             writes.apply_version(new_row, 0)
                           ),
                           r.branch(
                             // The row may have changed from the expected version
                             r.and(new_row.hasFields(hz_v),
                                   old_row(hz_v).default(-1).ne(new_row(hz_v))),
                             r.error(writes.invalidated_msg),

                             // Otherwise, we can update the row and version
                             writes.apply_version(old_row.merge(new_row),
                                                  old_row(hz_v).default(-1).add(1))
                           )
                         ), {returnChanges: 'always'}),

                     // The new row did not have an id, so it will autogenerate
                     collection.table.insert(writes.apply_version(new_row, 0),
                                             {returnChanges: 'always'})))
          .run(conn, reqlOptions)
    ).then((msg) => response.end(msg)).catch(next);
  };
}

module.exports = {
  name: 'hz_upsert',
  activate: (context) => ({
    methods: {
      upsert: {
        type: 'terminal',
        requires: ['hz_permissions'],
        handler: upsert(context),
      },
    },
  }),
};
