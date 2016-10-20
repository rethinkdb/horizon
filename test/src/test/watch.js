'use strict';

const utils = require('./utils');

const allTests = (collection) => {
  const numRows = 10;

  before('Clear collection', () => utils.clearCollection(collection));
  before('Populate collection', () => utils.populateCollection(collection, numRows));
  beforeEach('Authenticate client', (done) => utils.horizonTokenAuth('admin', done));
};

const suite = (collection) => describe('Subscribe', () => allTests(collection));

module.exports = {suite};
