'use strict';

const utils = require('./utils');

const all_tests = (collection) => {
  const num_rows = 10;

  before('Clear collection', (done) => utils.clear_collection(collection, done));
  before('Populate collection', (done) => utils.populate_collection(collection, num_rows, done));
  beforeEach('Authenticate client', utils.horizon_admin_auth);
};

const suite = (collection) => describe('Subscribe', () => all_tests(collection));

module.exports = { suite };
