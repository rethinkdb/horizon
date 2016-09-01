'use strict';

const common = require('./common');
const hz_v = common.version_field;

module.exports = (server) => (request, response, next) => {
  const r = server.r;
  const conn = server.rdb_connection().connection();
  const timeout = request.getParameter('timeout');
  const collection = request.getParameter('collection');
  const permissions = request.getParameter('hz_permissions');

  if (!collection) {
    throw new Error('No collection given for insert operation.');
  } else if (!permissions) {
    throw new Error('No permissions given for insert operation.');
  }

  common.retry_loop(request.options.update, permissions, timeout,
    (rows) => // pre-validation, all rows
      r.expr(rows)
        .map((new_row) =>
          collection.table.get(new_row('id')).do((old_row) =>
            r.branch(old_row.eq(null),
                     null,
                     [old_row, old_row.merge(new_row)])))
        .run(conn, common.reql_options),
    (validator, row, info) =>
      common.validate_old_row_required(
        validator, request.clientCtx, row, info[0], info[1]),
    (rows) => // write to database, all valid rows
      r.expr(rows)
        .forEach((new_row) =>
          collection.table.get(new_row('id')).replace((old_row) =>
              r.branch(// The row may have been deleted between the get and now
                       old_row.eq(null),
                       r.error(common.missing_msg),

                       // The row may have been changed between the get and now
                       r.and(new_row.hasFields(hz_v),
                             old_row(hz_v).default(-1).ne(new_row(hz_v))),
                       r.error(common.invalidated_msg),

                       // Otherwise we can update the row and increment the version
                       common.apply_version(r,
                                            old_row.merge(new_row),
                                            old_row(hz_v).default(-1).add(1))),
              {returnChanges: 'always'}))
        .run(conn, common.reql_options)
  ).then((msg) => response.end(msg)).catch(next);
};
