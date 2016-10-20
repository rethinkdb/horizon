'use strict';

const utils = require('./utils');

const allTests = (collection) => {
  const num_rows = 10;

  before('Clear collection', () => utils.clearCollection(collection));
  before('Populate collection', () => utils.populateCollection(collection, num_rows));
  beforeEach('Authenticate client', (done) => utils.horizon_token_auth('admin', done));
};

const suite = (collection) => describe('Subscribe', () => allTests(collection));

module.exports = {suite};
