'use strict';

const {r} = require('@horizon/server');
const {reqlOptions, writes} = require('@horizon/plugin-utils');

function insert(context) {
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

    writes.retryLoop(request.options.insert, permissions, timeout,
      (rows) => // pre-validation, all rows
        Array(rows.length).fill(null),
      (validator, row, info) => { // validation, each row
        if (!validator(info, row)) {
          return new Error(writes.unauthorizedMsg);
        }
      },
      (rows) => // write to database, all valid rows
        collection.table
          .insert(rows.map((row) => writes.applyVersion(r.expr(row), 0)),
                  {returnChanges: 'always'})
          .run(conn, reqlOptions)
    ).then((msg) => response.end(msg)).catch(next);
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
