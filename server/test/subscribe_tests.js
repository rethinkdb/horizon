'use strict';

const utils = require('./utils');

const all_tests = (table) => {
  const num_rows = 10;

  before('Clear table', (done) => utils.clear_table(table, done));
  before('Populate table', (done) => utils.populate_table(table, num_rows, done));
  beforeEach('Authenticate client', utils.horizon_default_auth);
};

const suite = (table) => describe('Subscribe', () => all_tests(table));

module.exports = { suite };
