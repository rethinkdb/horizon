'use strict';

const HorizonServer = require('@horizon/server');
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
  assert.strictEqual(horizonRouter, undefined);

  logger.info(`removing old rethinkdb data directory: ${dataDir}`);
  rm_sync_recursive(dataDir);

  logger.info('creating server');
  return start_rdb_server({dataDir}).then((server) => {
    rdbServer = server;
    rdbPort = server.driver_port;
    rdbHttpPort = server.http_port;
    logger.info('server created, connecting');

    return r.connect({db: projectName, port: rdbPort});
  }).then((conn) => {
    logger.info('connected');
    rdbConn = conn;
  }).then(() => {
    logger.info('creating http server');

    httpServer = new http.Server();
    return new Promise((resolve, reject) => {
      httpServer.listen(0, () => {
        logger.info('creating horizon server');
        horizonPort = httpServer.address().port;
        horizonRouter = new HorizonBaseRouter(httpServer, {
          projectName,
          rdbPort: rdbPort,
          auth: {
            tokenSecret: 'hunter2',
            allowUnauthenticated: true,
          },
        });

        const plugins_promise = horizonRouter.add(defaults, {
          auto_create_collection: true,
          auto_create_index: true,
        });

        horizonRouter.server.events.on('log', (level, message) => {
          logger[level](message);
        });
        horizonRouter.server.events.on('ready', () => {
          logger.info('horizon server ready');
          plugins_promise.then(resolve).catch(reject);
        });
        horizonRouter.server.events.on('unready', (server, err) => {
          logger.info(`horizon server unready: ${err}`);
        });
      });
      httpServer.on('error', reject);
    });
  });
}

function stopServers() {
  let localRdbServer = rdbServer;
  let localHorizonRouter = horizonRouter;
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
const table = (collection) =>
  r.table(
    r.db(projectName)
      .table('hz_collections')
      .get(collection)
      .do((row) =>
        r.branch(row.eq(null),
                 r.error('Collection does not exist.'),
                 row('id'))));

const make_token = (id) => {
  const jwt = horizonRouter && horizonRouter.server._auth && horizonRouter.server._auth._jwt;
  assert(jwt);
  return jwt.sign({id, provider: null}).token;
};

// Creates a collection, no-op if it already exists, uses horizon server prereqs
function create_collection(collection) {
  return new Promise((resolve, reject) => {
    assert.notStrictEqual(horizonRouter, undefined);
    assert.notStrictEqual(horizonPort, undefined);
    const conn = new websocket(`ws://localhost:${horizonPort}/horizon`,
                               HorizonServer.protocol,
                               {rejectUnauthorized: false})
      .once('error', (err) => assert.ifError(err))
      .on('open', () => {
        conn.send(JSON.stringify(make_handshake(123, 'token', make_token('admin'))));
        conn.once('message', (data) => {
          const res = JSON.parse(data);
          assert.strictEqual(res.requestId, 123);
          assert.strictEqual(typeof res.token, 'string');
          assert.strictEqual(res.id, 'admin');
          assert.strictEqual(res.provider, null);

          // This query should auto-create the collection if it's missing
          conn.send(JSON.stringify({
            requestId: 0,
            options: {collection: [collection], limit: [0], fetch: []},
          }));

          conn.once('message', (data) => {
            const message = JSON.parse(data);
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
};

// Removes all data from a collection - does not remove indexes
function clear_collection(collection) {
  assert.notStrictEqual(rdbConn, undefined);
  return table(collection).wait().do(() => table(collection).delete()).run(rdbConn);
};

// Populates a collection with the given rows
// If `rows` is a number, fill in data using all keys in [0, rows)
const populate_collection = (collection, rows) => {
  assert.notStrictEqual(rdbConn, undefined);

  if (!Array.isArray(rows)) {
    return table(collection).insert(
      r.range(rows).map(
        (i) => ({id: i, value: i.mod(4)})
      )).run(rdbConn);
  } else {
    return table(collection).insert(rows).run(rdbConn);
  }
};

const add_horizon_listener = (requestId, cb) => {
  assert(horizonAuthenticated, 'horizonConn was not authenticated before making requests');
  assert.notStrictEqual(requestId, undefined);
  assert.notStrictEqual(horizonListeners, undefined);
  assert.strictEqual(horizonListeners.get(requestId), undefined);
  horizonListeners.set(requestId, cb);
};

const remove_horizon_listener = (requestId) => {
  assert.notStrictEqual(requestId, undefined);
  assert.notStrictEqual(horizonListeners, undefined);
  horizonListeners.delete(requestId);
};

const dispatch_message = (raw) => {
  const msg = JSON.parse(raw);
  assert.notStrictEqual(msg.requestId, undefined);
  assert.notStrictEqual(horizonListeners, undefined);

  if (msg.requestId !== null) {
    const listener = horizonListeners.get(msg.requestId);
    assert.notStrictEqual(listener, undefined);
    listener(msg);
  }
};

const open_horizon_conn = (done) => {
  assert.notStrictEqual(horizonRouter, undefined);
  assert.strictEqual(horizonConn, undefined);
  logger.info('opening horizon conn');
  horizonAuthenticated = false;
  horizonListeners = new Map();
  horizonConn =
    new websocket(`ws://localhost:${horizonPort}/horizon`,
                  HorizonServer.protocol,
                  {rejectUnauthorized: false})
      .once('error', (err) => assert.ifError(err))
      .on('open', () => done());
};

const close_horizon_conn = () => {
  logger.info('closing horizon conn');
  if (horizonConn) { horizonConn.close(); }
  horizonConn = undefined;
  horizonListeners = undefined;
  horizonAuthenticated = false;
};

const horizon_auth = (req, cb) => {
  assert(horizonConn && horizonConn.readyState === websocket.OPEN);
  horizonConn.send(JSON.stringify(req));
  horizonConn.once('message', (auth_msg) => {
    horizonAuthenticated = true;
    const res = JSON.parse(auth_msg);
    horizonConn.on('message', (msg) => dispatch_message(msg));
    cb(res);
  });
};

const make_handshake = (requestId, method, token) =>
  ({requestId, type: 'handshake', options: {method, token}});

// Create a token for the admin user and use that to authenticate
const horizon_token_auth = (id, done) => {
  horizon_auth(make_handshake(-1, 'token', make_token(id)), (res) => {
    assert.strictEqual(res.requestId, -1);
    assert.strictEqual(typeof res.token, 'string');
    assert.strictEqual(res.id, id);
    assert.strictEqual(res.provider, null);
    done();
  });
};

const horizon_unauthenticated_auth = (done) => {
  horizon_auth(make_handshake(-1, 'unauthenticated'), (res) => {
    assert.strictEqual(res.requestId, -1);
    assert.strictEqual(typeof res.token, 'string');
    assert.strictEqual(res.id, null);
    assert.strictEqual(res.provider, 'unauthenticated');
    done();
  });
};

const convertResult = (result) => {
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
};

// `stream_test` will send a request (containing a requestId), and call the
// callback with (err, res), where `err` is the error string if an error
// occurred, or `null` otherwise.  `res` will be the value built by the server,
// which is the sum of all patches sent over the lifetime of the request.
const stream_test = (req, cb) => {
  assert(horizonConn && horizonConn.readyState === websocket.OPEN);
  let result = {};

  add_horizon_listener(req.requestId, (msg) => {
    if (msg.patch !== undefined) {
      result = jsonpatch.apply_patch(result, msg.patch);
    }
    if (msg.error !== undefined) {
      remove_horizon_listener(req.requestId);
      cb(new Error(msg.error), convertResult(result));
    } else if (msg.state === 'complete') {
      const res = result.val || (result.type === 'set' ? new Set() : []);
      remove_horizon_listener(req.requestId);
      assert(result.synced);
      cb(null, convertResult(result));
    }
  });

  horizonConn.send(JSON.stringify(req));
};

const check_error = (err, msg) => {
  assert.notStrictEqual(err, null, 'Should have gotten an error.');
  assert(err.message.indexOf(msg) !== -1, err.message);
};

const set_group = (group, done) => {
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
};

module.exports = {
  rdbConn: () => rdbConn,
  rdbHttpPort: () => rdbHttpPort,
  rdbPort: () => rdbPort,
  horizonConn: () => horizonConn,
  horizonPort: () => horizonPort,
  horizonListeners: () => horizonListeners,

  startServers, stopServers,
  logger: () => logger,

  create_collection,
  populate_collection,
  clear_collection,

  open_horizon_conn, close_horizon_conn,
  horizon_auth, horizon_token_auth, horizon_unauthenticated_auth,
  add_horizon_listener, remove_horizon_listener,

  set_group,

  stream_test,
  check_error,
  each_line_in_pipe,
  table,
};
