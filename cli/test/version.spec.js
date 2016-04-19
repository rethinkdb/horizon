'use strict';

const versionCommand = require('../src/version');
const assert = require('assert');
const sinon = require('sinon');
const pkg = require('../package.json');

describe('Version Command', () => {
  // Sadly this intercepts mocha output and you don't see
  // we either need to find something better to output information
  // in the terminal, or a better way to capture the output in test
  beforeEach(() => { sinon.stub(console, 'log'); });
  afterEach(() => { console.log.restore(); });

  it('prints the version and exits', () => {
    versionCommand.runCommand();
    assert.equal(console.log.args[0][0], pkg.version);
  });
});
