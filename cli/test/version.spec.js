'use strict';

const versionCommand = require('../src/version');
const assert = require('assert');
const sinon = require('sinon');
const pkg = require('../package.json');

describe('hz version', () => {
  beforeEach(() => sinon.stub(console, 'info'));
  afterEach(() => console.info.restore());

  it('prints the version and exits', () =>
    versionCommand.run().then(() =>
      assert.equal(console.info.args[0][0], pkg.version)));
});
