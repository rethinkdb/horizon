'use strict';

const {reqlOptions, writes} = require('@horizon/plugin-utils');
const hzv = writes.versionField;

function remove(context) {
  const r = context.horizon.r;
  return (req, res, next) => {
    const timeout = req.getParameter('timeout');
    const collection = req.getParameter('collection');
    const permissions = req.getParameter('hz_permissions');

    if (!collection) {
      throw new Error('No collection given for insert operation.');
    } else if (!permissions) {
      throw new Error('No permissions given for insert operation.');
    }

    writes.retryLoop(req.options.remove, permissions, timeout,
      (rows) => // pre-validation, all rows
        r.expr(rows.map((row) => row.id))
          .map((id) => collection.table.get(id))
          .run(context.horizon.conn(), reqlOptions),
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
            .do((writeRes) =>
              writeRes.merge({changes:
                r.range(rowData.count()).map((index) =>
                  r.branch(writeRes('changes')(index)('old_val').eq(null),
                           writeRes('changes')(index).merge(
                             {old_val: {id: rowData(index)('id')}}),
                           writeRes('changes')(index))).coerceTo('array'),
              })))
          .run(context.horizon.conn(), reqlOptions)
    ).then((patch) => res.end(patch)).catch(next);
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
