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

  describe('Test Optional Arguments', () => {

    it('Binds to localhost:4000', () => {
      mock({
        'test-app': {
          '.hz': {},
        },
      });

      process.chdir('test-app');

      opts.project = null;
      opts.bind = 4000

      assert.doesNotThrow(
        () => { serveCommand.runCommand(opts, () => {}); }
      );
    });

    it('Binds to localhost:4000, content server on localhost:3000', () => {
      mock({
        'test-app': {
          '.hz': {},
        },
      });

      process.chdir('test-app');

      opts.project = null;
      opts.bind = 4000
      opts.port = 3000

      assert.doesNotThrow(
        () => { serveCommand.runCommand(opts, () => {}); }
      );
    });

    it('Connect command works the same way (PORT 3000/4000)', () => {
      mock({
        'test-app': {
          '.hz': {},
        },
      });

      process.chdir('test-app');

      opts.project = null;
      opts.connect = "3000:4000"

      assert.doesNotThrow(
        () => { serveCommand.runCommand(opts, () => {}); }
      );
    });

    it('Allow unauthenticated request works', () => {
      mock({
        'test-app': {
          '.hz': {},
        },
      });

      process.chdir('test-app');

      opts.project = null;
      opts["allow-unauthenticated"] = true

      assert.doesNotThrow(
        () => { serveCommand.runCommand(opts, () => {}); }
      );
    });

    it('Enable Debugging works', () => {
      mock({
        'test-app': {
          '.hz': {},
        },
      });

      process.chdir('test-app');

      opts.project = null;
      opts["debug"] = true

      assert.doesNotThrow(
        () => { serveCommand.runCommand(opts, () => {}); }
      );
    });

    it('Enable insecure connection', () => {
      mock({
        'test-app': {
          '.hz': {},
        },
      });

      process.chdir('test-app');

      opts.project = null;
      opts["insecure"] = true

      assert.doesNotThrow(
        () => { serveCommand.runCommand(opts, () => {}); }
      );
    });

    it('Start RethinkDB in CWD', () => {
      mock({
        'test-app': {
          '.hz': {},
        },
      });

      process.chdir('test-app');

      opts.project = null;
      opts["start-rethinkdb"] = true

      assert.doesNotThrow(
        () => { serveCommand.runCommand(opts, () => {}); }
      );
    });

    it('Auto create table', () => {
      mock({
        'test-app': {
          '.hz': {},
        },
      });

      process.chdir('test-app');

      opts.project = null;
      opts["auto-create-table"] = true

      assert.doesNotThrow(
        () => { serveCommand.runCommand(opts, () => {}); }
      );
    });

    it('Auto create indexes', () => {
      mock({
        'test-app': {
          '.hz': {},
        },
      });

      process.chdir('test-app');

      opts.project = null;
      opts["auto-create-index"] = true

      assert.doesNotThrow(
        () => { serveCommand.runCommand(opts, () => {}); }
      );
    });

    it('Serves static content to ./foo', () => {
      mock({
        'test-app': {
          '.hz': {},
        },
      });

      process.chdir('test-app');

      opts.project = null;
      opts["server-static"] = "foo"

      assert.doesNotThrow(
        () => { serveCommand.runCommand(opts, () => {}); }
      );
    });

    it('Run in dev mode', () => {
      mock({
        'test-app': {
          '.hz': {},
        },
      });

      process.chdir('test-app');

      opts.project = null;
      opts["dev"] = true

      assert.doesNotThrow(
        () => { serveCommand.runCommand(opts, () => {}); }
      );
    });

  });

});
