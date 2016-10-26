'use strict';

const HorizonBaseRouter = require('@horizon/base-router');
const defaults = require('@horizon-plugins/defaults');

const rm_sync_recursive = require('horizon/src/utils/rm_sync_recursive');
const start_rdb_server = require('horizon/src/utils/start_rdb_server');
const each_line_in_pipe = require('horizon/src/utils/each_line_in_pipe');

const assert = require('assert');
const http = require('http');

const jsonpatch = require('jsonpatch');
const r = require('rethinkdb');
const websocket = require('ws');
const logger = require('winston');

const projectName = 'integration_test';
const dataDir = './rethinkdb_data_test';

const logFile = `./horizon_test_${process.pid}.log`;
logger.level = 'debug';
logger.add(logger.transports.File, {filename: logFile});
logger.remove(logger.transports.Console);

// Variables used by most tests
let rdbServer, rdbHttpPort, rdbPort, rdbConn, horizonPort, horizonConn, horizonListeners, horizonRouter, httpServer;
let horizonAuthenticated = false;

process.on('unhandledRejection', (reason) => {
  console.log(`Unhandled rejection at: ${reason.stack}`);
});

function startServers() {
  assert(!horizonRouter);

  logger.info(`removing old rethinkdb data directory: ${dataDir}`);
  rm_sync_recursive(dataDir);

  logger.info('creating server');
  rdbServer = start_rdb_server({dataDir});
  rdbServer.on('log', (level, message) => {
    logger[level](message);
  });

  return rdbServer.ready().then(() => {
    logger.info('server created, connecting');
    rdbPort = rdbServer.driverPort;
    rdbHttpPort = rdbServer.httpPort;
    return r.connect({db: projectName, port: rdbPort});
  }).then((conn) => {
    logger.info('connected');
    rdbConn = conn;
  }).then(() => {
    logger.info('creating http server');

    httpServer = new http.Server();
    horizonRouter = new HorizonBaseRouter(httpServer, {
      projectName,
      rdbPort: rdbPort,
      auth: {
        tokenSecret: 'hunter2',
        allowUnauthenticated: true,
      },
    });

    horizonRouter.server.events.on('log', (level, message) => {
      logger[level](message);
    });
    horizonRouter.server.events.on('unready', (server, err) => {
      logger.info(`horizon server unready: ${err}`);
    });

    return Promise.all([
      horizonRouter.add(defaults, {autoCreateCollection: true, autoCreateIndex: true}),
      new Promise((resolve) => horizonRouter.server.events.on('ready', resolve)),
      new Promise((resolve, reject) => {
        httpServer.listen(0, () => {
          horizonPort = httpServer.address().port;
          resolve();
        });
        httpServer.on('error', reject);
      }),
    ]).then(() =>
      logger.info('horizon server ready')
    );
  });
}

function stopServers() {
  const localRdbServer = rdbServer;
  const localHorizonRouter = horizonRouter;
  horizonRouter = undefined;
  rdbServer = undefined;

  return Promise.resolve().then(() => {
    if (localHorizonRouter) {
      localHorizonRouter.server.events.removeAllListeners('ready');
      localHorizonRouter.server.events.removeAllListeners('unready');
      return localHorizonRouter.close();
    }
  }).then(() => {
    if (localRdbServer) {
      localRdbServer.close();
    }
  });
}

// Used to prefix reql queries with the underlying table of a given collection
function table(collection) {
  return r.table(
    r.db(projectName)
      .table('hz_collections')
      .get(collection)
      .do((row) =>
        r.branch(row.eq(null),
                 r.error('Collection does not exist.'),
                 row('id'))));
}

function makeToken(id) {
  assert(horizonRouter);
  return horizonRouter.server.context.horizon.auth.tokens.sign({id, provider: null}).token;
}

function makeHandshake(requestId, method, token) {
  return {requestId, type: 'handshake', options: {method, token}};
}

// Creates a collection, no-op if it already exists, uses horizon server prereqs
function createCollection(collection) {
  return new Promise((resolve, reject) => {
    assert(horizonRouter);
    assert(horizonPort);
    const conn = new websocket(`ws://localhost:${horizonPort}/horizon`,
                               horizonRouter.server.context.horizon.protocol,
                               {rejectUnauthorized: false})
      .once('error', (err) => assert.ifError(err))
      .on('open', () => {
        conn.send(JSON.stringify(makeHandshake(123, 'token', makeToken('admin'))));
        conn.once('message', (handshakeResponse) => {
          const res = JSON.parse(handshakeResponse);
          assert.strictEqual(res.requestId, 123);
          assert.strictEqual(typeof res.token, 'string');
          assert.strictEqual(res.id, 'admin');
          assert.strictEqual(res.provider, null);

          // This query should auto-create the collection if it's missing
          conn.send(JSON.stringify({
            requestId: 0,
            options: {collection: [collection], limit: [0], fetch: []},
          }));

          conn.once('message', (queryResponse) => {
            const message = JSON.parse(queryResponse);
            conn.close();
            if (message.error) {
              reject(new Error(message.error));
            } else {
              resolve();
            }
          });
        });
      });
  });
}

// Removes all data from a collection - does not remove indexes
function clearCollection(collection) {
  assert(rdbConn);
  return table(collection).wait().do(() => table(collection).delete()).run(rdbConn);
}

// Populates a collection with the given rows
// If `rows` is a number, fill in data using all keys in [0, rows)
function populateCollection(collection, rows) {
  assert(rdbConn);

  if (!Array.isArray(rows)) {
    return table(collection).insert(
      r.range(rows).map(
        (i) => ({id: i, value: i.mod(4)})
      )).run(rdbConn);
  } else {
    return table(collection).insert(rows).run(rdbConn);
  }
}

function addHorizonListener(requestId, cb) {
  assert(horizonAuthenticated, 'horizonConn was not authenticated before making requests');
  assert(horizonListeners);
  assert(!horizonListeners.get(requestId));
  horizonListeners.set(requestId, cb);
};

function removeHorizonListener(requestId) {
  assert(horizonListeners);
  horizonListeners.delete(requestId);
};

function dispatchMessage (raw) {
  assert(horizonListeners);

  const msg = JSON.parse(raw);
  if (msg.requestId !== null) {
    const listener = horizonListeners.get(msg.requestId);
    assert(listener);
    listener(msg);
  }
}

function openHorizonConn(done) {
  assert(horizonRouter);
  assert(!horizonConn);
  logger.info('opening horizon conn');
  horizonAuthenticated = false;
  horizonListeners = new Map();
  horizonConn =
    new websocket(`ws://localhost:${horizonPort}/horizon`,
                  horizonRouter.server.context.horizon.protocol,
                  {rejectUnauthorized: false})
      .once('error', (err) => assert.ifError(err))
      .on('open', () => done());
}

function closeHorizonConn() {
  logger.info('closing horizon conn');
  if (horizonConn) { horizonConn.close(); }
  horizonConn = undefined;
  horizonListeners = undefined;
  horizonAuthenticated = false;
}

function horizonAuth(req, cb) {
  assert(horizonConn && horizonConn.readyState === websocket.OPEN);
  horizonConn.send(JSON.stringify(req));
  horizonConn.once('message', (auth_msg) => {
    horizonAuthenticated = true;
    const res = JSON.parse(auth_msg);
    horizonConn.on('message', (msg) => dispatchMessage(msg));
    cb(res);
  });
}

// Create a token for the admin user and use that to authenticate
function horizonTokenAuth(id, done) {
  horizonAuth(makeHandshake(-1, 'token', makeToken(id)), (res) => {
    assert.strictEqual(res.requestId, -1);
    assert.strictEqual(typeof res.token, 'string');
    assert.strictEqual(res.id, id);
    assert.strictEqual(res.provider, null);
    done();
  });
}

function horizonUnauthenticatedAuth(done) {
  horizonAuth(makeHandshake(-1, 'unauthenticated'), (res) => {
    assert.strictEqual(res.requestId, -1);
    assert.strictEqual(typeof res.token, 'string');
    assert.strictEqual(res.id, null);
    assert.strictEqual(res.provider, 'unauthenticated');
    done();
  });
}

function convertResult(result) {
  switch (result.type) {
  case 'set':
    const set = new Set();
    if (result.val) {
      for (const item in result.val) {
        set.add(item);
      }
    }
    return set;
  case 'value':
    return result.val;
  case undefined:
    assert.strictEqual(result.val, undefined);
    return;
  default:
    throw new Error(`Unexpected result type: "${result.type}"`);
  }
}

// `streamTest` will send a request (containing a requestId), and call the
// callback with (err, res), where `err` is the error string if an error
// occurred, or `null` otherwise.  `res` will be the value built by the server,
// which is the sum of all patches sent over the lifetime of the request.
function streamTest(req, cb) {
  assert(horizonConn && horizonConn.readyState === websocket.OPEN);
  let result = {};

  addHorizonListener(req.requestId, (msg) => {
    if (msg.patch !== undefined) {
      result = jsonpatch.apply_patch(result, msg.patch);
    }
    if (msg.error !== undefined) {
      removeHorizonListener(req.requestId);
      cb(new Error(msg.error), convertResult(result));
    } else if (msg.complete) {
      const res = result.val || (result.type === 'set' ? new Set() : []);
      removeHorizonListener(req.requestId);
      assert(result.synced);
      cb(null, convertResult(result));
    }
  });

  horizonConn.send(JSON.stringify(req));
}

function checkError(err, msg) {
  assert.notStrictEqual(err, null, 'Should have gotten an error.');
  assert(err.message.indexOf(msg) !== -1, err.message);
}

function setGroup(group, done) {
  assert(horizonRouter && rdbConn);
  r.db(projectName)
    .table('hz_groups')
    .get(group.id)
    .replace(group)
    .run(rdbConn)
    .then((res, err) => {
      assert.ifError(err);
      assert(res && res.errors === 0);
      done();
    });
}

module.exports = {
  rdbConn: () => rdbConn,
  rdbHttpPort: () => rdbHttpPort,
  rdbPort: () => rdbPort,
  horizonConn: () => horizonConn,
  horizonPort: () => horizonPort,
  horizonListeners: () => horizonListeners,
  logger: () => logger,

  startServers, stopServers,

  createCollection,
  populateCollection,
  clearCollection,

  openHorizonConn, closeHorizonConn,
  horizonAuth, horizonTokenAuth, horizonUnauthenticatedAuth,
  addHorizonListener, removeHorizonListener,

  setGroup,

  streamTest,
  checkError,
  table,
};
