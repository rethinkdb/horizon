/* global beforeEach, describe, process, afterEach, it, require */

'use strict';

const initCommand = require('../src/init');
const assert = require('chai').assert;
const fs = require('fs');
const mockFs = require('mock-fs');
const path = require('path');
const sinon = require('sinon');
const toml = require('toml');

const testCwd = path.resolve(process.cwd());

function assertNameExists(cwd, fileName) {
  const files = fs.readdirSync(cwd);
  assert.include(files, fileName);
}

function assertNameDoesntExist(cwd, fileName) {
  const files = fs.readdirSync(cwd);
  assert.notInclude(files, fileName);
}

function assertDirExists(cwd, dirName) {
  assertNameExists(cwd, dirName);
  assert.isTrue(fs.statSync(`${cwd}/${dirName}`).isDirectory());
}

function assertDirDoesntExist(cwd, dirName) {
  assertNameDoesntExist(cwd, dirName);
}

function assertFileExists(cwd, fileName) {
  assertNameExists(cwd, fileName);
  assert.isTrue(fs.statSync(`${cwd}/${fileName}`).isFile());
}

function assertFileDoesntExist(cwd, fileName) {
  assertNameDoesntExist(cwd, fileName);
}

function getFileString(filepath) {
  return fs.readFileSync(filepath, { encoding: 'utf8' });
}

function readToml(filepath) {
  const tomlData = getFileString(filepath);
  return toml.parse(tomlData);
}

function assertValidConfig(filepath) {
  const configObject = readToml(filepath);
  // Need an uncommented project name
  assert.property(configObject, 'project_name');
}

function assertValidSecrets(filepath) {
  const secretsObject = readToml(filepath);
  // Need an uncommented token_secret
  assert.property(secretsObject, 'token_secret');
}

function assertConfigProjectName(filepath, expectedName) {
  const configObject = readToml(filepath);
  assert.propertyVal(configObject, 'project_name', expectedName);
}

describe('hz init', () => {
  beforeEach(() => {
    sinon.stub(console, 'error');
    sinon.stub(console, 'info');
    sinon.stub(process, 'exit');
  });
  afterEach(() => {
    process.chdir(testCwd);
    mockFs.restore();
    console.error.restore();
    console.info.restore();
    process.exit.restore();
  });
  describe('when passed a project name,', () => {
    const testDirName = 'test-app';
    const projectDir = `${testCwd}/${testDirName}`;
    const runOptions = { projectName: testDirName };
    it("creates the project dir if it doesn't exist", (done) => {
      mockFs();
      initCommand.runCommand(runOptions);
      assertDirExists(testCwd, testDirName);
      done();
    });
    it('moves into the project dir', (done) => {
      mockFs({
        [testDirName]: {},
      });
      initCommand.runCommand(runOptions);
      assert.equal(process.cwd(), `${testCwd}/${testDirName}`);
      done();
    });
    describe('when the project dir is empty,', () => {
      beforeEach(() => {
        mockFs({ [projectDir]: {} });
      });
      it('creates the src dir', (done) => {
        initCommand.runCommand(runOptions);
        assertDirExists(projectDir, 'src');
        done();
      });
      it('creates the dist dir', (done) => {
        initCommand.runCommand(runOptions);
        assertDirExists(projectDir, 'dist');
        done();
      });
      it('creates an example dist/index.html', (done) => {
        initCommand.runCommand(runOptions);
        assertFileExists(`${projectDir}/dist`, 'index.html');
        done();
      });
      it('creates the .hz dir', (done) => {
        initCommand.runCommand(runOptions);
        assertDirExists(projectDir, '.hz');
        done();
      });
      it('creates the .gitignore file', (done) => {
        initCommand.runCommand(runOptions);
        assertFileExists(`${projectDir}`, '.gitignore');
        done();
      });
      it('creates the .hz/config.toml file', (done) => {
        initCommand.runCommand(runOptions);
        assertFileExists(`${projectDir}/.hz`, 'config.toml');
        done();
      });
      it('creates the .hz/secrets.toml file', (done) => {
        initCommand.runCommand(runOptions);
        assertFileExists(`${projectDir}/.hz`, 'secrets.toml');
        done();
      });
      it('creates the .hz/schema.toml file', (done) => {
        initCommand.runCommand(runOptions);
        assertFileExists(`${projectDir}/.hz`, 'schema.toml');
        done();
      });
    });
    describe('when the project dir is not empty,', () => {
      beforeEach(() => {
        mockFs({
          [projectDir]: {
            lib: { 'someFile.html': '<blink>Something</blink>' },
          },
        });
      });
      it("doesn't create the src dir", (done) => {
        initCommand.runCommand(runOptions);
        assertDirDoesntExist(projectDir, 'src');
        done();
      });
      it("doesn't create the dist dir", (done) => {
        initCommand.runCommand(runOptions);
        assertDirDoesntExist(projectDir, 'dist');
        done();
      });
      it("doesn't create an example dist/index.html", (done) => {
        fs.mkdirSync(`${projectDir}/dist`);
        initCommand.runCommand(runOptions);
        assertFileDoesntExist(`${projectDir}/dist`, 'index.html');
        done();
      });
      it("still creates the .hz dir if it doesn't exist", (done) => {
        initCommand.runCommand(runOptions);
        assertDirExists(projectDir, '.hz');
        done();
      });
      it("doesn't create the .hz dir if it already exists", (done) => {
        fs.mkdirSync(`${projectDir}/.hz`);
        const beforeMtime = fs.statSync(`${projectDir}/.hz`).birthtime.getTime();
        initCommand.runCommand(runOptions);
        const afterMtime = fs.statSync(`${projectDir}/.hz`).birthtime.getTime();
        assert.equal(beforeMtime, afterMtime, '.hz was modified');
        done();
      });
      it("creates a valid config.toml if it doesn't exist", (done) => {
        fs.mkdirSync(`${projectDir}/.hz`);
        initCommand.runCommand(runOptions);
        assertFileExists(`${projectDir}/.hz`, 'config.toml');
        assertValidConfig(`${projectDir}/.hz/config.toml`);
        done();
      });
      it("creates a valid secrets.toml if it doesn't exist", (done) => {
        fs.mkdirSync(`${projectDir}/.hz`);
        initCommand.runCommand(runOptions);
        assertFileExists(`${projectDir}/.hz`, 'secrets.toml');
        assertValidSecrets(`${projectDir}/.hz/secrets.toml`);
        done();
      });
      it("creates a valid schema.toml if it doesn't exist", (done) => {
        fs.mkdirSync(`${projectDir}/.hz`);
        initCommand.runCommand(runOptions);
        assertFileExists(`${projectDir}/.hz`, 'schema.toml');
        // assertValidSchema(`${projectDir}/.hz/schema.toml`);
        done();
      });
      it("doesn't touch the config.toml if it already exists", (done) => {
        fs.mkdirSync(`${projectDir}/.hz`);
        const filename = `${projectDir}/.hz/config.toml`;
        fs.appendFileSync(filename, '#Hoo\n');
        const beforeMtime = fs.statSync(filename).mtime.getTime();
        initCommand.runCommand(runOptions);
        const afterMtime = fs.statSync(filename).mtime.getTime();
        assert.equal(beforeMtime, afterMtime);
        const afterContents = getFileString(filename);
        assert.equal('#Hoo\n', afterContents);
        done();
      });
      it("doesn't touch the secrets.toml if it already exists", (done) => {
        fs.mkdirSync(`${projectDir}/.hz`);
        const filename = `${projectDir}/.hz/secrets.toml`;
        fs.appendFileSync(filename, '#Hoo\n');
        const beforeMtime = fs.statSync(filename).mtime.getTime();
        initCommand.runCommand(runOptions);
        const afterMtime = fs.statSync(filename).mtime.getTime();
        assert.equal(beforeMtime, afterMtime);
        const afterContents = getFileString(filename);
        assert.equal('#Hoo\n', afterContents);
        done();
      });
      it("doesn't touch the schema.toml if it already exists", (done) => {
        fs.mkdirSync(`${projectDir}/.hz`);
        const filename = `${projectDir}/.hz/schema.toml`;
        fs.appendFileSync(filename, '#Hoo\n');
        const beforeMtime = fs.statSync(filename).mtime.getTime();
        initCommand.runCommand(runOptions);
        const afterMtime = fs.statSync(filename).mtime.getTime();
        assert.equal(beforeMtime, afterMtime);
        const afterContents = getFileString(filename);
        assert.equal('#Hoo\n', afterContents);
        done();
      });
    });
  });
  describe('when not passed a project name,', () => {
    const runOptions = { };
    it('stays in the current directory', (done) => {
      mockFs();
      const beforeCwd = process.cwd();
      initCommand.runCommand(runOptions);
      const afterCwd = process.cwd();
      assert.equal(beforeCwd, afterCwd, 'init changed directories');
      done();
    });
    describe('in an empty directory,', () => {
      beforeEach(() => {
        mockFs({});
      });
      it('creates the src dir', (done) => {
        initCommand.runCommand(runOptions);
        assertDirExists(testCwd, 'src');
        done();
      });
      it('creates the dist dir', (done) => {
        initCommand.runCommand(runOptions);
        assertDirExists(testCwd, 'dist');
        done();
      });
      it('creates an example dist/index.html', (done) => {
        initCommand.runCommand(runOptions);
        assertFileExists(`${testCwd}/dist`, 'index.html');
        done();
      });
      it('creates the .hz dir', (done) => {
        initCommand.runCommand(runOptions);
        assertDirExists(testCwd, '.hz');
        done();
      });
      it('creates the .hz/config.toml file', (done) => {
        initCommand.runCommand(runOptions);
        assertFileExists(`${testCwd}/.hz`, 'config.toml');
        assertValidConfig(`${testCwd}/.hz/config.toml`);
        done();
      });
    });
    describe('in a directory with files in it', () => {
      beforeEach(() => {
        mockFs({
          lib: { 'some_file.txt': 'Some file content' },
        });
      });
      it("doesn't create the src dir", (done) => {
        initCommand.runCommand(runOptions);
        assertDirDoesntExist(testCwd, 'src');
        done();
      });
      it("doesn't create the dist dir", (done) => {
        initCommand.runCommand(runOptions);
        assertDirDoesntExist(testCwd, 'dist');
        done();
      });
      it("doesn't create an example dist/index.html", (done) => {
        fs.mkdirSync(`${testCwd}/dist`);
        initCommand.runCommand(runOptions);
        assertFileDoesntExist(`${testCwd}/dist`, 'index.html');
        done();
      });
      it("creates the .hz dir if it doesn't exist", (done) => {
        initCommand.runCommand(runOptions);
        assertDirExists(testCwd, '.hz');
        done();
      });
      it("doesn't create the .hz dir if it exists", (done) => {
        const hzDir = `${testCwd}/.hz`;
        fs.mkdirSync(hzDir);
        const beforeTime = fs.statSync(hzDir).birthtime.getTime();
        initCommand.runCommand(runOptions);
        assertDirExists(testCwd, '.hz');
        const afterTime = fs.statSync(hzDir).birthtime.getTime();
        assert.equal(beforeTime, afterTime, '.hz birthtime changed');
        done();
      });
      it("creates the config.toml if it doesn't exist", (done) => {
        initCommand.runCommand(runOptions);
        assertFileExists(`${testCwd}/.hz`, 'config.toml');
        assertValidConfig(`${testCwd}/.hz/config.toml`);
        done();
      });
      it("doesn't touch the config.toml if it already exists", (done) => {
        fs.mkdirSync(`${testCwd}/.hz`);
        const filename = `${testCwd}/.hz/config.toml`;
        fs.appendFileSync(filename, '#Hoo\n');
        const beforeMtime = fs.statSync(filename).mtime.getTime();
        initCommand.runCommand(runOptions);
        const afterMtime = fs.statSync(filename).mtime.getTime();
        assert.equal(beforeMtime, afterMtime);
        const afterContents = getFileString(filename);
        assert.equal('#Hoo\n', afterContents);
        done();
      });
    });
  });
});
