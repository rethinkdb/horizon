'use strict';

const logger = require('../src/logger');
const utils = require('./utils');

const all_suites = [ 'http_tests',
                     'prereq_tests',
                     'protocol_tests',
                     'query_tests',
                     'subscribe_tests',
                     'write_tests',
                     'permissions' ];
const collection = 'test';

before('Start RethinkDB Server', () => utils.start_rethinkdb());
after('Stop RethinkDB Server', () => utils.stop_rethinkdb());

beforeEach(
  /** @this mocha */
  function() { logger.info(`Start test '${this.currentTest.title}'`); });

afterEach(
  /** @this mocha */
  function() { logger.info(`End test '${this.currentTest.title}'`); });

describe('Horizon Server',
  /** @this mocha */
  function() {
    before('Start Horizon Server', utils.start_horizon_server);
    after('Close Horizon Server', utils.close_horizon_server);

    before(`Creating general-purpose collection: '${collection}'`,
           (done) => utils.create_collection(collection, done));

    beforeEach('Connect Horizon Client', utils.open_horizon_conn);
    afterEach('Close Horizon Client', utils.close_horizon_conn);
    all_suites.forEach((s) => require(`./${s}`).suite(collection));
  });
