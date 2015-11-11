'use strict';

const { logger } = require('../src/server');
const utils = require('./utils');

// Test cases
const all_suites = [
    require('./http_tests'),
    require('./prereq_tests'),
    require('./protocol_tests'),
    require('./query_tests'),
    require('./subscribe_tests'),
    require('./write_tests'),
  ];

const table = 'test';

describe('Fusion Server', () => {
  before('Start RethinkDB Server', utils.start_rdb_server);
  before(`Creating general-purpose table: '${table}'`,
         (done) => utils.create_table(table, done));

  beforeEach(function() { logger.info(`Start test '${this.currentTest.title}'`); });
  afterEach(function() { logger.info(`End test '${this.currentTest.title}'`); });

  describe('HTTP', () => {
      before('Start Fusion Server', utils.start_unsecure_fusion_server);
      after('Close Fusion Server', utils.close_fusion_server);
      beforeEach('Connect Fusion Client', utils.open_fusion_conn);
      afterEach('Close Fusion Client', utils.close_fusion_conn);

      all_suites.forEach((s) => s.suite(table));
    });

  describe('HTTPS', () => {
      before('Start Fusion Server', utils.start_secure_fusion_server);
      after('Close Fusion Server', utils.close_fusion_server);
      beforeEach('Connect Fusion Client', utils.open_fusion_conn);
      afterEach('Close Fusion Client', utils.close_fusion_conn);

      all_suites.forEach((s) => s.suite(table));
    });
});
