'use strict';

const logger = require('../src/server').logger;
const utils = require('./utils');

const all_suites = [ 'http_tests',
                     'prereq_tests',
                     'protocol_tests',
                     'query_tests',
                     'subscribe_tests',
                     'write_tests' ];
const table = 'test';

before('Start RethinkDB Server',
       /** @this mocha */
       function(done) {
         this.timeout(5000);
         utils.start_rdb_server({ }, done);
       });


beforeEach(
  /** @this mocha */
  function() { logger.info(`Start test '${this.currentTest.title}'`); });

afterEach(
  /** @this mocha */
  function() { logger.info(`End test '${this.currentTest.title}'`); });

describe('Horizon Server', () => {
  before('Start Horizon Server',
         /** @this mocha */
         function(done) {
           this.timeout(5000);
           utils.start_horizon_server(done);
         });

  after('Close Horizon Server', utils.close_horizon_server);

  before(`Creating general-purpose table: '${table}'`,
         /** @this mocha */
         function(done) {
           this.timeout(5000);
           utils.create_table(table, done);
         });

  beforeEach('Connect Horizon Client', utils.open_horizon_conn);
  afterEach('Close Horizon Client', utils.close_horizon_conn);
  all_suites.forEach((s) => require('./' + s).suite(table));
});
