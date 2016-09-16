'use strict';

const {r} = require('@horizon/server');
const {reqlOptions, writes} = require('@horizon/plugin-utils');
const hzv = writes.versionField;

function update(context) {
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

    writes.retryLoop(req.options.update, permissions, timeout,
      (rows) => // pre-validation, all rows
        r.expr(rows)
          .map((newRow) =>
            collection.table.get(newRow('id')).do((oldRow) =>
              r.branch(oldRow.eq(null),
                       null,
                       [oldRow, oldRow.merge(newRow)])))
          .run(conn, reqlOptions),
      (validator, row, info) =>
        writes.validateOldRowRequired(validator, row, info[0], info[1]),
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

                         // Otherwise we can update the row and increment the version
                         writes.applyVersion(oldRow.merge(newRow),
                                             oldRow(hzv).default(-1).add(1))),
                {returnChanges: 'always'}))
          .run(conn, reqlOptions)
    ).then((patch) => res.end(patch)).catch(next);
  };
}

module.exports = {
  name: 'hz_update',
  activate: (context) => ({
    methods: {
      update: {
        type: 'terminal',
        requires: ['hz_permissions'],
        handler: update(context),
      },
    },
  }),
};
