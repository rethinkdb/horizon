'use strict';

const metadataVersion = [2, 0, 0];

function createCollection(context, name) {
  const r = context.horizon.r;
  const db = context.horizon.options.projectName;
  return r.db(db).table('hz_collections').get(name).replace({id: name}).do((res) =>
    r.branch(
      res('errors').ne(0),
      r.error(res('first_error')),
      res('inserted').eq(1),
      r.db(db).tableCreate(name),
      res
    )
  ).run(context.horizon.conn());
}

function initializeMetadata(context) {
  const r = context.horizon.r;
  const db = context.horizon.options.projectName;
  const conn = context.horizon.conn();
  return r.branch(r.dbList().contains(db), null, r.dbCreate(db)).run(conn)
    .then(() =>
      Promise.all(['hz_collections', 'hz_users_auth', 'hz_groups'].map((table) =>
        r.branch(r.db(db).tableList().contains(table),
                 { },
                 r.db(db).tableCreate(table))
          .run(conn))))
    .then(() =>
      r.db(db).table('hz_collections').wait({timeout: 30}).run(conn))
    .then(() =>
      Promise.all([
        r.db(db).tableList().contains('users').not().run(conn).then(() =>
          createCollection(context, 'users')),
        r.db(db).table('hz_collections')
          .insert({id: 'hz_metadata', version: metadataVersion})
          .run(conn),
      ])
    );
}

module.exports = {
  createCollection,
  initializeMetadata,
};
