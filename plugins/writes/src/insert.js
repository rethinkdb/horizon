'use strict';

const common = require('./common');

module.exports = (server) => (request, response, next) => {
  const r = server.r;
  const conn = server.rdb_connection().connection();
  const timeout = request.getParameter('timeout');
  const collection = request.getParameter('collection');
  const permissions = request.getParameter('permissions');

  if (!collection) {
    throw new Error('No collection given for insert operation.');
  } else if (!permissions) {
    throw new Error('No permissions given for insert operation.');
  }

  common.retry_loop(request.options.insert, permissions, timeout,
    (rows) => // pre-validation, all rows
      Array(rows.length).fill(null),
    (validator, row, info) => { // validation, each row
      if (!validator(request.clientCtx, info, row)) {
        return new Error(common.unauthorized_msg);
      }
    },
    (rows) => // write to database, all valid rows
      collection.table
        .insert(rows.map((row) => common.apply_version(r, r.expr(row), 0)),
                {returnChanges: 'always'})
        .run(conn, common.reql_options)
  ).then((msg) => response.end(msg)).catch(next);
};
