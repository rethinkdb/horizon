'use strict';

const {r} = require('@horizon/server');
const {reqlOptions, writes} = require('@horizon/plugin-utils');
const hzv = writes.versionField;

function replace(context) {
  return (req, res, next) => {
    const conn = context.horizon.rdbConnection.connection();
    const timeout = req.getParameter('timeout');
    const collection = req.getParameter('collection');
    const permissions = req.getParameter('hz_permissions');

    if (!collection) {
      throw new Error('No collection given for insert operation.');
    } else if (!permissions) {
      throw new Error('No permissions given for insert operation.');
    }

    writes.retryLoop(req.options.replace, permissions, timeout,
      (rows) => // pre-validation, all rows
        r.expr(rows.map((row) => row.id))
          .map((id) => collection.table.get(id))
          .run(conn, reqlOptions),
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
                           newRow, oldRow(hzv).default(-1).add(1))),
                {returnChanges: 'always'}))
        .run(conn, reqlOptions)
    ).then((patch) => res.end(patch)).catch(next);
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
