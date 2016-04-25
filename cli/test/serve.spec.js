'use strict';

const serveCommand = require('../src/serve');
const assert = require('assert');
const mock = require('mock-fs');
const sinon = require('sinon');
const path = require('path');

const opts = {
  insecure: true,
  bind: [],
};

describe('Serve Command', () => {
  afterEach(() => {
    mock.restore();
  });

  describe('with --project', () => {
    it('switches to project dir if it has .hz dir', () => {
      mock({
        'test-app': {
          '.hz': {},
        },
      });

      opts.project = 'test-app';

      serveCommand.runCommand(opts, () => {});

      assert(path.basename(process.cwd()) === 'test-app');
    });

    it('errors if project dir does not contain .hz', () => {
      mock({ 'test-app': {} });
      sinon.stub(console, 'error');
      sinon.stub(process, 'exit');

      opts.project = 'test-app';

      serveCommand.runCommand(opts, () => {});

      assert(console.error.calledTwice);
      assert(console.error.calledWithMatch(/Project specified but no .hz/));
      assert(process.exit.calledWith(1));

      console.error.restore();
      process.exit.restore();
    });
  });

  describe('without --project', () => {
    it('continues if .hz dir is found', () => {
      mock({
        'test-app': {
          '.hz': {},
        },
      });

      process.chdir('test-app');

      opts.project = null;

      assert.doesNotThrow(
        () => { serveCommand.runCommand(opts, () => {}); }
      );
    });

    it('errors if .hz dir is not found', () => {
      mock();
      sinon.stub(console, 'error');
      sinon.stub(process, 'exit');

      opts.project = null;

      serveCommand.runCommand(opts, () => {});

      assert(console.error.calledTwice);
      assert(console.error.calledWithMatch(/Project not specified or .hz/));
      assert(process.exit.calledWith(1));

      console.error.restore();
      process.exit.restore();
    });
  });
});
