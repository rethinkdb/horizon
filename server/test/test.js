'use strict';

const { logger } = require('../src/server');
const utils = require('./utils');

const all_suites = [ 'http_tests',
                     'prereq_tests',
                     'protocol_tests',
                     'query_tests',
                     'subscribe_tests',
                     'write_tests' ];
const table = 'test';

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

describe('Fusion Server', () => {
  before('Start Fusion Server', function (done) {
    this.timeout(5000);
    utils.start_fusion_server(done);
  });
  after('Close Fusion Server', utils.close_fusion_server);
  before(`Creating general-purpose table: '${table}'`, function (done) {
    this.timeout(5000);
    utils.create_table(table, done);
  });
  beforeEach('Connect Fusion Client', utils.open_fusion_conn);
  afterEach('Close Fusion Client', utils.close_fusion_conn);
  all_suites.forEach((s) => require('./' + s).suite(table));
});
