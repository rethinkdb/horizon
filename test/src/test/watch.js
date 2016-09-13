'use strict';

const utils = require('./utils');

const all_tests = (collection) => {
  const num_rows = 10;

  before('Clear collection', () => utils.clear_collection(collection));
  before('Populate collection', () => utils.populate_collection(collection, num_rows));
  beforeEach('Authenticate client', (done) => utils.horizon_token_auth('admin', done));
};

const suite = (collection) => describe('Subscribe', () => all_tests(collection));

module.exports = {suite};
