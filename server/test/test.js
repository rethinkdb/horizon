'use strict';

const utils = require('./utils.js');
const logger = require('../src/server.js').logger;

// Test cases
const protocol_tests = require('./protocol_tests.js');
const http_tests = require('./http_tests.js');
const query_tests = require('./query_tests.js');
const write_tests = require('./write_tests.js');
const subscribe_tests = require('./subscribe_tests.js');

var common_tests = () => {
  describe('Webserver Tests', http_tests.all_tests);
  describe('Protocol Tests', protocol_tests.all_tests);
  describe('Query Tests', query_tests.all_tests);
  describe('Write Tests', write_tests.all_tests);
  describe('Subscribe Tests', subscribe_tests.all_tests);
};

describe('Fusion Server', () => {
  before('Start RethinkDB Server', utils.start_rdb_server);
  beforeEach(() => { logger.info(`Start test '${this.currentTest.title}'`); });

  describe('HTTP:', () => {
      before('Start Fusion Server', utils.start_unsecure_fusion_server);
      after('Close Fusion Server', utils.close_fusion_server);
      beforeEach('Connect Fusion Client', utils.start_fusion_client);
      afterEach('Close Fusion Client', utils.close_fusion_client);

      common_tests();
    });

  describe('HTTPS:', () => {
      before('Start Fusion Server', utils.start_secure_fusion_server);
      after('Close Fusion Server', utils.close_fusion_server);
      beforeEach('Connect Fusion Client', utils.start_fusion_client);
      afterEach('Close Fusion Client', utils.close_fusion_client);

      common_tests();
    });
});
