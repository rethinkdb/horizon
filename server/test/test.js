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
  before('Start RethinkDB Server', function (done) {
    this.timeout(5000);
    utils.start_rdb_server(done);
  });


  beforeEach(
    /** @this - provided by mocha, cannot use an arrow function here */
    function() { logger.info(`Start test '${this.currentTest.title}'`); });

  afterEach(
    /** @this - provided by mocha, cannot use an arrow function here */
    function() { logger.info(`End test '${this.currentTest.title}'`); });

  describe('HTTP', () => {
    before('Start Fusion Server', function (done) {
      this.timeout(5000);
      utils.start_unsecure_fusion_server(done);
    });
    after('Close Fusion Server', utils.close_fusion_server);
    before(`Creating general-purpose table: '${table}'`, function (done) {
      this.timeout(5000);
      utils.create_table(table, done);
    });
    beforeEach('Connect Fusion Client', utils.open_fusion_conn);
    afterEach('Close Fusion Client', utils.close_fusion_conn);

    all_suites.forEach((s) => s.suite(table));
  });

  describe('HTTPS', () => {
    before('Start Fusion Server', function (done) {
      this.timeout(5000);
      utils.start_unsecure_fusion_server(done);
    });
    after('Close Fusion Server', utils.close_fusion_server);
    before(`Creating general-purpose table: '${table}'`, function (done) {
      this.timeout(5000);
      utils.create_table(table, done);
    });
    beforeEach('Connect Fusion Client', utils.open_fusion_conn);
    afterEach('Close Fusion Client', utils.close_fusion_conn);

    all_suites.forEach((s) => s.suite(table));
  });
});
