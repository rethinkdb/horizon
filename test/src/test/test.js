'use strict';

const utils = require('./utils');

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
       () => utils.createCollection(collection));

beforeEach(function () {
  const title = this.currentTest ? this.currentTest.title : '(null)';
  utils.logger().info(`Start test '${title}'`);
});

afterEach(function () {
  const title = this.currentTest ? this.currentTest.title : '(null)';
  utils.logger().info(`End test '${title}'`);
});

beforeEach('Connect Horizon Client', utils.openHorizonConn);
afterEach('Close Horizon Client', utils.closeHorizonConn);

all_suites.forEach((s) => require(`./${s}`).suite(collection));
