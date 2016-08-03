/* global beforeEach, describe, process, afterEach, it, require */

'use strict';

const init = require('../src/init');
const assert = require('chai').assert;
const fs = require('fs');
const mockFs = require('mock-fs');
const path = require('path');
const sinon = require('sinon');
const toml = require('toml');

const original_dir = path.resolve(process.cwd());
const hz_dir = `${original_dir}/.hz`;

const assertNameExists = (baseDir, fileName) => {
  const files = fs.readdirSync(baseDir);
  assert.include(files, fileName);
};

const assertNameDoesntExist = (baseDir, fileName) => {
  const files = fs.readdirSync(baseDir);
  assert.notInclude(files, fileName);
};

const assertDirExists = (baseDir, dirName) => {
  assertNameExists(baseDir, dirName);
  assert.isTrue(fs.statSync(`${baseDir}/${dirName}`).isDirectory());
};

const assertDirDoesntExist = (baseDir, dirName) => {
  assertNameDoesntExist(baseDir, dirName);
};

const assertFileExists = (baseDir, fileName) => {
  assertNameExists(baseDir, fileName);
  assert.isTrue(fs.statSync(`${baseDir}/${fileName}`).isFile());
};

const assertFileDoesntExist = (baseDir, fileName) => {
  assertNameDoesntExist(baseDir, fileName);
};

const getFileString = (filepath) =>
  fs.readFileSync(filepath, { encoding: 'utf8' });

const readToml = (filepath) => {
  const tomlData = getFileString(filepath);
  return toml.parse(tomlData);
};

const assertValidConfig = (filepath) => {
  const configObject = readToml(filepath);
  // Need an uncommented project name
  assert.property(configObject, 'project_name');
};

const assertValidSecrets = (filepath) => {
  const secretsObject = readToml(filepath);
  // Need an uncommented token_secret
  assert.property(secretsObject, 'token_secret');
};

describe('hz init', () => {
  beforeEach('redirect console out', () => {
    sinon.stub(console, 'error');
    sinon.stub(console, 'info');
  });

  afterEach('restore console out', () => {
    console.error.restore();
    console.info.restore();
  });

  afterEach('restore cwd', () => process.chdir(original_dir));
  afterEach('clear mockfs', () => mockFs.restore());

  describe('when passed a project name', () => {
    const testDirName = 'test-app';
    const projectDir = `${original_dir}/${testDirName}`;
    const args = [ testDirName ];

    it("creates the project dir if it doesn't exist", () => {
      mockFs();
      return init.run(args).then(() =>
        assertDirExists(original_dir, testDirName)
      );
    });

    it('moves into the project dir', () => {
      mockFs({ [testDirName]: { } });
      return init.run(args).then(() =>
        assert.equal(process.cwd(), `${original_dir}/${testDirName}`)
      );
    });

    describe('when the project dir is empty', () => {
      beforeEach('initialize mockfs', () => {
        mockFs({ [projectDir]: {} });
      });

      it('creates the src dir', () =>
        init.run(args).then(() =>
          assertDirExists(projectDir, 'src')));

      it('creates the dist dir', () =>
        init.run(args).then(() =>
          assertDirExists(projectDir, 'dist')));

      it('creates an example dist/index.html', () =>
        init.run(args).then(() =>
          assertFileExists(`${projectDir}/dist`, 'index.html')));

      it('creates the .hz dir', () =>
        init.run(args).then(() =>
          assertDirExists(projectDir, '.hz')));

      it('creates the .gitignore file', () =>
        init.run(args).then(() =>
          assertFileExists(`${projectDir}`, '.gitignore')));

      it('creates the .hz/config.toml file', () =>
        init.run(args).then(() =>
          assertFileExists(`${projectDir}/.hz`, 'config.toml')));

      it('creates the .hz/secrets.toml file', () =>
        init.run(args).then(() =>
          assertFileExists(`${projectDir}/.hz`, 'secrets.toml')));

      it('creates the .hz/schema.toml file', () =>
        init.run(args).then(() =>
          assertFileExists(`${projectDir}/.hz`, 'schema.toml')));
    });

    describe('when the project dir is not empty', () => {
      beforeEach('initialize mockfs', () => {
        mockFs({
          [projectDir]: {
            lib: { 'someFile.html': '<blink>Something</blink>' },
          },
        });
      });

      it("doesn't create the src dir", () =>
        init.run(args).then(() =>
          assertDirDoesntExist(projectDir, 'src')));

      it("doesn't create the dist dir", () =>
        init.run(args).then(() =>
          assertDirDoesntExist(projectDir, 'dist')));

      it("doesn't create an example dist/index.html", () => {
        fs.mkdirSync(`${projectDir}/dist`);
        return init.run(args).then(() =>
          assertFileDoesntExist(`${projectDir}/dist`, 'index.html')
        );
      });

      it("still creates the .hz dir if it doesn't exist", () =>
        init.run(args).then(() =>
          assertDirExists(projectDir, '.hz')));

      it("doesn't create the .hz dir if it already exists", () => {
        fs.mkdirSync(`${projectDir}/.hz`);
        const beforeMtime = fs.statSync(`${projectDir}/.hz`).birthtime.getTime();

        return init.run(args).then(() => {
          const afterMtime = fs.statSync(`${projectDir}/.hz`).birthtime.getTime();
          assert.equal(beforeMtime, afterMtime, '.hz was modified');
        });
      });

      it("creates a valid config.toml if it doesn't exist", () => {
        fs.mkdirSync(`${projectDir}/.hz`);
        return init.run(args).then(() => {
          assertFileExists(`${projectDir}/.hz`, 'config.toml');
          assertValidConfig(`${projectDir}/.hz/config.toml`);
        });
      });

      it("creates a valid secrets.toml if it doesn't exist", () => {
        fs.mkdirSync(`${projectDir}/.hz`);
        return init.run(args).then(() => {
          assertFileExists(`${projectDir}/.hz`, 'secrets.toml');
          assertValidSecrets(`${projectDir}/.hz/secrets.toml`);
        });
      });

      it("creates a valid schema.toml if it doesn't exist", () => {
        fs.mkdirSync(`${projectDir}/.hz`);
        return init.run(args).then(() => {
          assertFileExists(`${projectDir}/.hz`, 'schema.toml');
          // TODO: assertValidSchema(`${projectDir}/.hz/schema.toml`);
        });
      });

      it("doesn't touch the config.toml if it already exists", () => {
        fs.mkdirSync(`${projectDir}/.hz`);
        const filename = `${projectDir}/.hz/config.toml`;
        fs.appendFileSync(filename, '#Hoo\n');
        const beforeMtime = fs.statSync(filename).mtime.getTime();

        return init.run(args).then(() => {
          const afterMtime = fs.statSync(filename).mtime.getTime();
          assert.equal(beforeMtime, afterMtime);
          const afterContents = getFileString(filename);
          assert.equal('#Hoo\n', afterContents);
        });
      });

      it("doesn't touch the secrets.toml if it already exists", () => {
        fs.mkdirSync(`${projectDir}/.hz`);
        const filename = `${projectDir}/.hz/secrets.toml`;
        fs.appendFileSync(filename, '#Hoo\n');
        const beforeMtime = fs.statSync(filename).mtime.getTime();

        return init.run(args).then(() => {
          const afterMtime = fs.statSync(filename).mtime.getTime();
          assert.equal(beforeMtime, afterMtime);
          const afterContents = getFileString(filename);
          assert.equal('#Hoo\n', afterContents);
        });
      });

      it("doesn't touch the schema.toml if it already exists", () => {
        fs.mkdirSync(`${projectDir}/.hz`);
        const filename = `${projectDir}/.hz/schema.toml`;
        fs.appendFileSync(filename, '#Hoo\n');
        const beforeMtime = fs.statSync(filename).mtime.getTime();

        return init.run(args).then(() => {
          const afterMtime = fs.statSync(filename).mtime.getTime();
          assert.equal(beforeMtime, afterMtime);
          const afterContents = getFileString(filename);
          assert.equal('#Hoo\n', afterContents);
        });
      });
    });
  });

  describe('when not passed a project name', () => {
    const args = [ ];

    it('stays in the current directory', () => {
      mockFs();
      return init.run(args).then(() => {
        const afterCwd = process.cwd();
        assert.equal(original_dir, afterCwd, 'init changed directories');
      });
    });

    describe('in an empty directory', () => {
      beforeEach('initialize mockfs', () => mockFs({}));

      it('creates the src dir', () =>
        init.run(args).then(() =>
          assertDirExists(original_dir, 'src')));

      it('creates the dist dir', () =>
        init.run(args).then(() =>
          assertDirExists(original_dir, 'dist')));

      it('creates an example dist/index.html', () =>
        init.run(args).then(() =>
          assertFileExists(`${original_dir}/dist`, 'index.html')));

      it('creates the .hz dir', () =>
        init.run(args).then(() =>
          assertDirExists(original_dir, '.hz')));

      it('creates the .hz/config.toml file', () =>
        init.run(args).then(() => {
          assertFileExists(hz_dir, 'config.toml');
          assertValidConfig(`${hz_dir}/config.toml`);
        }));
    });

    describe('in a directory with files in it', () => {
      beforeEach('initialize mocks', () => {
        mockFs({
          lib: { 'some_file.txt': 'Some file content' },
        });
      });

      it("doesn't create the src dir", () =>
        init.run(args).then(() =>
          assertDirDoesntExist(original_dir, 'src')));

      it("doesn't create the dist dir", () =>
        init.run(args).then(() =>
          assertDirDoesntExist(original_dir, 'dist')));

      it("doesn't create an example dist/index.html", () => {
        fs.mkdirSync(`${original_dir}/dist`);
        return init.run(args).then(() =>
          assertFileDoesntExist(`${original_dir}/dist`, 'index.html')
        );
      });

      it("creates the .hz dir if it doesn't exist", () =>
        init.run(args).then(() =>
          assertDirExists(original_dir, '.hz')));

      it("doesn't create the .hz dir if it exists", () => {
        fs.mkdirSync(hz_dir);
        const beforeTime = fs.statSync(hz_dir).birthtime.getTime();

        return init.run(args).then(() => {
          assertDirExists(original_dir, '.hz');
          const afterTime = fs.statSync(hz_dir).birthtime.getTime();
          assert.equal(beforeTime, afterTime, '.hz birthtime changed');
        });
      });

      it("creates the config.toml if it doesn't exist", () =>
        init.run(args).then(() => {
          assertFileExists(hz_dir, 'config.toml');
          assertValidConfig(`${hz_dir}/config.toml`);
        })
      );

      it("doesn't touch the config.toml if it already exists", () => {
        fs.mkdirSync(hz_dir);
        const filename = `${hz_dir}/config.toml`;
        fs.appendFileSync(filename, '#Hoo\n');
        const beforeMtime = fs.statSync(filename).mtime.getTime();

        return init.run(args).then(() => {
          const afterMtime = fs.statSync(filename).mtime.getTime();
          assert.equal(beforeMtime, afterMtime);
          const afterContents = getFileString(filename);
          assert.equal('#Hoo\n', afterContents);
        });
      });
    });
  });
});

