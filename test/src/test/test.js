'use strict';

require('source-map-support').install();

const utils = require('./utils');

const logger = require('@horizon/server').logger;

const all_suites = ['prereq',
                    'protocol',
                    'fetch',
                    'watch',
                    'write',
                    'permissions'];
const collection = 'test';

before('Start RethinkDB Server', () => utils.start_rethinkdb());
after('Stop RethinkDB Server', () => utils.stop_rethinkdb());

beforeEach(
  /** @this mocha */
  function() { logger.info(`Start test '${this.currentTest.title}'`); });

afterEach(
  /** @this mocha */
  function() { logger.info(`End test '${this.currentTest.title}'`); });

describe('Horizon Server', () => {
  before('Start Horizon Server', utils.start_horizon_server);
  after('Close Horizon Server', utils.close_horizon_server);

  before(`Creating general-purpose collection: '${collection}'`,
         () => utils.create_collection(collection));

  beforeEach('Connect Horizon Client', utils.open_horizon_conn);
  afterEach('Close Horizon Client', utils.close_horizon_conn);
  all_suites.forEach((s) => require(`./${s}`).suite(collection));
});
