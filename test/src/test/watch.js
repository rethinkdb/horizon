'use strict';

const utils = require('./utils');

const all_tests = (collection) => {
  const num_rows = 10;

  before('Clear collection', () => utils.clear_collection(collection));
  before('Populate collection', () => utils.populate_collection(collection, num_rows));
  beforeEach('Authenticate client', utils.horizon_admin_auth);
};

const suite = (collection) => describe('Subscribe', () => all_tests(collection));

module.exports = {suite};
