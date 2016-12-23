'use strict';

const {reqlOptions, writes} = require('@horizon/plugin-utils');
const hzv = writes.versionField;

function replace(context) {
  const r = context.horizon.r;
  return (req, res, next) => {
    const timeout = req.getParameter('timeout');
    const collection = req.getParameter('collection');
    const permissions = req.getParameter('hz_permissions');

    if (!collection) {
      throw new Error('No collection given for replace operation.');
    } else if (!permissions) {
      throw new Error('No permissions given for replace operation.');
    }

    writes.retryLoop(req.options.replace, permissions, timeout,
      (rows) => // pre-validation, all rows
        r.expr(rows.map((row) => row.id))
          .map((id) => collection.table.get(id))
          .run(context.horizon.conn(), reqlOptions),
      (validator, row, info) =>
        writes.validateOldRowRequired(validator, row, info, row),
      (rows) => // write to database, all valid rows
        r.expr(rows)
          .forEach((newRow) =>
            collection.table.get(newRow('id')).replace((oldRow) =>
                r.branch(// The row may have been deleted between the get and now
                         oldRow.eq(null),
                         r.error(writes.missingMsg),

                         // The row may have been changed between the get and now
                         r.and(newRow.hasFields(hzv),
                               oldRow(hzv).default(-1).ne(newRow(hzv))),
                         r.error(writes.invalidatedMsg),

                         // Otherwise, we can safely replace the row
                         writes.applyVersion(
                           r, newRow, oldRow(hzv).default(-1).add(1))),
                {returnChanges: 'always'}))
        .run(context.horizon.conn(), reqlOptions)
    ).then((patches) => {
      patches.map((patch) => res.write(patch));
      res.end();
    }).catch(next);
  };
}

module.exports = {
  name: 'hz_replace',
  activate: (context) => ({
    methods: {
      replace: {
        type: 'terminal',
        requires: ['hz_permissions'],
        handler: replace(context),
      },
    },
  }),
};
