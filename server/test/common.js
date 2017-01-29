/* TODO: move auth out of server
'use strict';

const startRdbServer = require('horizon/src/utils/start_rdb_server');

// TODO: auth depends on tables ensured by the metadata in the collection plugin
//  provide a dynamic method for storing/retrieving users
const {initializeMetadata} = require('@horizon-plugins/collection/src/queries');

const assert = require('assert');
const EventEmitter = require('events');

const r = startRdbServer.r;
const projectName = 'unittest';
const db = r.db(projectName);
const usersTable = db.table('users');
const usersAuthTable = db.table('hz_users_auth');

const tokenSecret = 'hunter2';
const secretKey = new Buffer(tokenSecret, 'base64');

let rdbServer, rdbConn;

function startRethinkdb() {
  rdbServer = startRdbServer({dataDir: ''});
  return rdbServer.ready()
    .then(() => rdbServer.connect())
    .then((conn) => (rdbConn = conn))
    .then(() => initializeMetadata(makeContext()))
    .then(() =>
      r.expr(['users', 'hz_users_auth'])
        .forEach((table) => db.table(table).wait())
        .run(rdbConn));
}

function stopRethinkdb() {
  assert(rdbServer);
  rdbServer.close();
  rdbServer = null;
}

function makeContext(options) {
  const authOptions = Object.assign({
    tokenSecret,
    createNewUsers: true,
    newUserGroup: 'fooGroup',
    allowAnonymous: true,
    allowUnauthenticated: true,
  }, (options && options.auth) || {});

  const serverOptions = Object.assign({
    projectName,
    rdbPort: rdbServer ? rdbServer.driverPort : 28015,
  }, options || {});
  serverOptions.auth = authOptions;

  return {
    horizon: {
      r,
      conn: () => rdbConn,
      events: new EventEmitter(),
      options: serverOptions,
    },
  };
}

function addUser(provider, id) {
  assert(rdbServer);
  return r.uuid().do((userId) =>
    r.expr([
      usersTable.insert({id: userId, groups: ['default', 'authenticated']}),
      usersAuthTable.insert({
        id: [provider, id],
        user_id: userId, // eslint-disable-line camelcase
      }),
    ]).do(() => userId)
  ).run(rdbConn);
}

function clearUsers() {
  assert(rdbServer);
  return Promise.all([
    usersTable.delete().run(rdbConn),
    usersAuthTable.delete().run(rdbConn),
  ]);
}

module.exports = {
  r,
  makeContext,
  startRethinkdb,
  stopRethinkdb,
  secretKey,
  rdbConn: () => rdbConn,
  addUser,
  clearUsers,
  usersTable,
  usersAuthTable,
};

*/
