'use strict';

const {r} = require('@horizon/server');
const {reqlOptions, writes} = require('@horizon/plugin-utils');
const hz_v = writes.versionField;

function remove(context) {
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

    writes.retry_loop(request.options.remove, permissions, timeout,
      (rows) => // pre-validation, all rows
        r.expr(rows.map((row) => row.id))
          .map((id) => collection.table.get(id))
          .run(conn, reqlOptions),
      (validator, row, info) =>
        writes.validate_old_row_required(validator, row, info, null),
      (rows) => // write to database, all valid rows
        r.expr(rows).do((row_data) =>
          row_data.forEach((info) =>
            collection.table.get(info('id')).replace((row) =>
                r.branch(// The row may have been deleted between the get and now
                         row.eq(null),
                         null,

                         // The row may have been changed between the get and now
                         r.and(info.hasFields(hz_v),
                               row(hz_v).default(-1).ne(info(hz_v))),
                         r.error(writes.invalidated_msg),

                         // Otherwise, we can safely remove the row
                         null),

                {returnChanges: 'always'}))
            // Pretend like we deleted rows that didn't exist
            .do((res) =>
              res.merge({changes:
                r.range(row_data.count()).map((index) =>
                  r.branch(res('changes')(index)('old_val').eq(null),
                           res('changes')(index).merge(
                             {old_val: {id: row_data(index)('id')}}),
                           res('changes')(index))).coerceTo('array'),
              })))
          .run(conn, reqlOptions)
    ).then((msg) => response.end(msg)).catch(next);
  };
}

module.exports = {
  name: 'hz_remove',
  activate: (context) => ({
    methods: {
      remove: {
        type: 'terminal',
        requires: ['hz_permissions'],
        handler: remove(context),
      },
    },
  }),
};
