'use strict';

const {r} = require('@horizon/server');
const {reqlOptions, writes} = require('@horizon/plugin-utils');
const hzv = writes.versionField;

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

    writes.retryLoop(request.options.remove, permissions, timeout,
      (rows) => // pre-validation, all rows
        r.expr(rows.map((row) => row.id))
          .map((id) => collection.table.get(id))
          .run(conn, reqlOptions),
      (validator, row, info) =>
        writes.validateOldRowRequired(validator, row, info, null),
      (rows) => // write to database, all valid rows
        r.expr(rows).do((rowData) =>
          rowData.forEach((info) =>
            collection.table.get(info('id')).replace((row) =>
                r.branch(// The row may have been deleted between the get and now
                         row.eq(null),
                         null,

                         // The row may have been changed between the get and now
                         r.and(info.hasFields(hzv),
                               row(hzv).default(-1).ne(info(hzv))),
                         r.error(writes.invalidatedMsg),

                         // Otherwise, we can safely remove the row
                         null),

                {returnChanges: 'always'}))
            // Pretend like we deleted rows that didn't exist
            .do((res) =>
              res.merge({changes:
                r.range(rowData.count()).map((index) =>
                  r.branch(res('changes')(index)('old_val').eq(null),
                           res('changes')(index).merge(
                             {old_val: {id: rowData(index)('id')}}),
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
