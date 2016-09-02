'use strict';

const common = require('./common');
const hz_v = common.version_field;

const {r} = require('@horizon/server');

module.exports = (server) => (request, response, next) => {
  const conn = server.rdb_connection().connection();
  const timeout = request.getParameter('timeout');
  const collection = request.getParameter('collection');
  const permissions = request.getParameter('hz_permissions');

  if (!collection) {
    throw new Error('No collection given for insert operation.');
  } else if (!permissions) {
    throw new Error('No permissions given for insert operation.');
  }

  common.retry_loop(request.options.remove, permissions, timeout,
    (rows) => // pre-validation, all rows
      r.expr(rows.map((row) => row.id))
        .map((id) => collection.table.get(id))
        .run(conn, common.reql_options),
    (validator, row, info) =>
      common.validate_old_row_required(validator, request.clientCtx, row, info, null),
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
                       r.error(common.invalidated_msg),

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
        .run(conn, common.reql_options)
  ).then((msg) => response.end(msg)).catch(next);
};
