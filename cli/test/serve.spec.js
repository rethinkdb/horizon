'use strict';

const assert = require('chai').assert;
const mockFs = require('mock-fs');
const sinon = require('sinon');
const serveCommand = require('../src/serve');


const globalTestOpts = {
  insecure: true,
  bind: [],
};
Object.freeze(globalTestOpts);

describe('hz serve', () => {
  beforeEach(() => {
    sinon.stub(console, 'error');
    sinon.stub(process, 'exit');
  });
  afterEach(() => {
    mockFs.restore();
    process.exit.restore();
    console.error.restore();
  });
  describe('given a project path,', () => {
    const currentOpts = Object.assign({
      project_path: 'test-app',
    }, globalTestOpts);
    beforeEach(() => {
      mockFs({
        'test-app': {
          '.hz': {
            'config.toml': 'project_name = "projectName"\n',
          },
        },
      });
    });
    it('switches to the path', (done) => {
      const topDir = process.cwd();
      serveCommand.runCommand(currentOpts, () => {});
      const afterDir = process.cwd();
      assert.equal(`${topDir}/test-app`, afterDir);
      done();
    });
    it("exits if the .hz dir doesn't exist", (done) => {
      mockFs({
        'test-app': {},
      });
      serveCommand.runCommand(currentOpts, () => {});
      assert.isTrue(console.error
                    .calledWithMatch(/doesn't contain an .hz directory/));
      assert.isTrue(process.exit.calledWith(1));
      done();
    });
    it('continues if .hz dir does exist', (done) => {
      serveCommand.runCommand(currentOpts, () => {});
      assert.isTrue(process.exit.neverCalledWith(1));
      done();
    });
  });
  describe('not given a project path', () => {
    const currentOpts = Object.assign({
      project_path: '.',
    }, globalTestOpts);
    beforeEach(() => {
      mockFs({
        '.hz': {
          'config.toml': 'project_name = "projectName"\n',
        },
      });
    });
    it("doesn't change directories", (done) => {
      const beforeDir = process.cwd();
      serveCommand.runCommand(currentOpts, () => {});
      const afterDir = process.cwd();
      assert.equal(beforeDir, afterDir, 'directory changed');
      done();
    });
    it("exits if the .hz dir doesn't exist", (done) => {
      mockFs({});
      serveCommand.runCommand(currentOpts, () => {});
      assert.isTrue(console.error
                    .calledWithMatch(/doesn't contain an .hz directory/));
      assert.isTrue(process.exit.calledWith(1));
      done();
    });
    it('continues if .hz dir does exist', (done) => {
      serveCommand.runCommand(currentOpts, () => {});
      assert.isTrue(process.exit.neverCalledWith(1));
      done();
    });
  });
});
