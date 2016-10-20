'use strict';

const utils = require('./utils');

const allSuites = ['prereq',
                   'protocol',
                   'fetch',
                   'watch',
                   'write',
                   'permissions'];

const collection = 'test';

before('Start servers', () => utils.startServers());
after('Stop servers', () => utils.stopServers());

before(`Creating general-purpose collection: '${collection}'`,
       () => utils.createCollection(collection));

beforeEach(
  /** @this mocha */
  function () {
    const title = this.currentTest ? this.currentTest.title : '(null)';
    utils.logger().info(`Start test '${title}'`);
  });

afterEach(
  /** @this mocha */
  function () {
    const title = this.currentTest ? this.currentTest.title : '(null)';
    utils.logger().info(`End test '${title}'`);
  });

beforeEach('Connect Horizon Client', utils.openHorizonConn);
afterEach('Close Horizon Client', utils.closeHorizonConn);

allSuites.forEach((s) => require(`./${s}`).suite(collection));
