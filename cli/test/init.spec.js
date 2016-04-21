'use strict';

const initCommand = require('../src/init');
const assert = require('assert');
const fs = require('fs');
const mock = require('mock-fs');
const path = require('path');
const sinon = require('sinon');

let appPath;

describe('Init Command', () => {
  beforeEach(() => {
    appPath = path.resolve(process.cwd());
  });
  afterEach(() => { mock.restore(); });

  it('makes the project directory if it doesn\'t exist', (done) => {
    mock();

    initCommand.runCommand({ projectName: 'test-app' });

    fs.readdir(appPath, (_, files) => {
      assert(files.length === 1);
      assert(files[0].match(/test-app/));
      done();
    });
  });

  it('errors if the directory already exists', () => {
    mock({ 'test-app': {} });
    sinon.stub(console, 'error');
    // We have to stub process.exit to catch the exit in the test process
    // otherwise it stops the test process and doesn't run any more tests
    sinon.stub(process, 'exit');

    initCommand.runCommand({ projectName: 'test-app' });

    assert(console.error.args[0][0].match(/test-app already exists/));
    assert(process.exit.calledWith(1) === true);

    console.error.restore();
    process.exit.restore();
  });

  it('creates in current directory if projectName is null', () => {
    mock();
    sinon.stub(console, 'info');

    initCommand.runCommand({});
    assert(console.info.args[0][0].match(/in current directory/));

    console.info.restore();
  });

  it('creates src directory if none exists', (done) => {
    mock();

    initCommand.runCommand({ projectName: 'test-app' });

    fs.readdir(process.cwd(), (_, files) => {
      assert(files.filter((f) => f === 'src').length === 1);
      done();
    });
  });

  it('creates dist directory if none exists', (done) => {
    mock();

    initCommand.runCommand({ projectName: 'test-app' });

    fs.readdir(process.cwd(), (_, files) => {
      assert(files.filter((f) => f === 'dist').length === 1);
      done();
    });
  });

  it('creates .hz directory if none exists', (done) => {
    mock();

    initCommand.runCommand({ projectName: 'test-app' });

    fs.readdir(process.cwd(), (_, files) => {
      assert(files.filter((f) => f === '.hz').length === 1);
      done();
    });
  });

  it('creates dist/index.html if none exists', (done) => {
    mock();

    initCommand.runCommand({ projectName: 'test-app' });

    fs.readdir(path.resolve(process.cwd(), 'dist'), (_, files) => {
      assert(files[0] === 'index.html');
      done();
    });
  });

  it('creates .hz/config.toml if none exists', (done) => {
    mock();

    initCommand.runCommand({ projectName: 'test-app' });

    fs.readdir(path.resolve(process.cwd(), '.hz'), (_, files) => {
      assert(files[0] === 'config.toml');
      done();
    });
  });
});
