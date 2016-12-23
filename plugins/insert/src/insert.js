'use strict';

const {reqlOptions, writes} = require('@horizon/plugin-utils');

function insert(context) {
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

    writes.retryLoop(req.options.insert, permissions, timeout,
      (rows) => // pre-validation, all rows
        Array(rows.length).fill(null),
      (validator, row, info) => { // validation, each row
        if (!validator(info, row)) {
          return new Error(writes.unauthorizedMsg);
        }
      },
      (rows) => // write to database, all valid rows
        collection.table
          .insert(rows.map((row) => writes.applyVersion(r, r.expr(row), 0)),
                  {returnChanges: 'always'})
          .run(context.horizon.conn(), reqlOptions)
    ).then((patches) => {
      patches.map((patch) => res.write(patch));
      res.end();
    }).catch(next);
  };
}

module.exports = {
  name: 'hz_insert',
  activate: (context) => ({
    methods: {
      insert: {
        type: 'terminal',
        requires: ['hz_permissions'],
        handler: insert(context),
      },
    },
  }),
};
