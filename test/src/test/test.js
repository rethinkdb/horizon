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

before('Start servers', () => utils.startServers());
after('Stop servers', () => utils.stopServers());

before(`Creating general-purpose collection: '${collection}'`,
       () => utils.create_collection(collection));

beforeEach(
  /** @this mocha */
  function() { logger.info(`Start test '${this.currentTest.title}'`); });

afterEach(
  /** @this mocha */
  function() { logger.info(`End test '${this.currentTest.title}'`); });

beforeEach('Connect Horizon Client', utils.open_horizon_conn);
afterEach('Close Horizon Client', utils.close_horizon_conn);

all_suites.forEach((s) => require(`./${s}`).suite(collection));
