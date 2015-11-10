'use strict';

const utils = require('./utils.js');
const logger = require('../src/server.js').logger;

// Test cases
const all_suites = [
    require('./http_tests.js'),
    require('./protocol_tests.js'),
    require('./query_tests.js'),
    require('./write_tests.js'),
    require('./subscribe_tests.js'),
    require('./prereq_tests.js'),
  ];

const table = 'test';

describe('Fusion Server', () => {
  before('Start RethinkDB Server', utils.start_rdb_server);
  before(`Creating general-purpose table: '${table}'`,
         (done) => utils.create_table(table, done));

  beforeEach(function() { logger.info(`Start test '${this.currentTest.title}'`); });
  afterEach(function() { logger.info(`End test '${this.currentTest.title}'`); });

  describe('HTTP:', () => {
      before('Start Fusion Server', utils.start_unsecure_fusion_server);
      after('Close Fusion Server', utils.close_fusion_server);
      beforeEach('Connect Fusion Client', utils.open_fusion_conn);
      afterEach('Close Fusion Client', utils.close_fusion_conn);

      all_suites.forEach((s) => describe(s.name, () => s.all_tests(table)));
    });

  describe('HTTPS:', () => {
      before('Start Fusion Server', utils.start_secure_fusion_server);
      after('Close Fusion Server', utils.close_fusion_server);
      beforeEach('Connect Fusion Client', utils.open_fusion_conn);
      afterEach('Close Fusion Client', utils.close_fusion_conn);

      all_suites.forEach((s) => describe(s.name, () => s.all_tests(table)));
    });
});
