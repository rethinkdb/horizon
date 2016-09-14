'use strict';

const serve = require('../src/serve');
const schema = require('../src/schema');
const start_rdb_server = require('../src/utils/start_rdb_server');
const rm_sync_recursive = require('../src/utils/rm_sync_recursive');

const tmpdir = require('os').tmpdir;

const assert = require('chai').assert;
const mockFs = require('mock-fs');

const project_name = 'test_app';
const serve_args = [
  '--secure=false',
  '--port=0',
  '--auto-create-collection',
  `--project-name=${project_name}`,
  `--token-secret=test-token`
];
const make_args = (args) => serve_args.concat(args);

const valid_project_data = {
  '.hz': {
    'config.toml': 'project_name = "projectName"\n',
  },
};

describe('hz serve', () => {
  const rdb_data_dir = `${tmpdir()}/horizon-test-${process.pid}`;
  let rdb_server;

  before('start rethinkdb', () =>
    start_rdb_server({
      quiet: true,
      dataDir: rdb_data_dir,
    }).then((server) => {
      rdb_server = server;
      serve_args.push(`--connect=localhost:${rdb_server.driver_port}`);
    })
  );

  // Run schema apply with a blank schema
  before('initialize rethinkdb', () => {
    mockFs({ 'schema.toml': '' });
    return schema.run([ 'apply', 'schema.toml',
                        `--connect=localhost:${rdb_server.driver_port}`,
                        `--project-name=${project_name}` ])
      .then(() => mockFs.restore());
  });

  after('stop rethinkdb', () => rdb_server && rdb_server.close());
  after('delete rethinkdb data directory', () => rm_sync_recursive(rdb_data_dir));

  afterEach('restore mockfs', () => mockFs.restore());

  describe('with a project path', () => {
    beforeEach('initialize mockfs', () => mockFs({ [project_name]: valid_project_data }));

    it('changes to the project directory', () => {
      const before_dir = process.cwd();
      return serve.run(make_args([ project_name ]), Promise.resolve()).then(() =>
        assert.strictEqual(`${before_dir}/${project_name}`, process.cwd(),
                           'directory should have changed')
      );
    });

    it('fails if the .hz dir does not exist', () => {
      mockFs({ [project_name]: {} });
      return serve.run(make_args([ project_name ]), Promise.resolve()).then(() =>
        assert(false, 'should have failed because the .hz directory is missing')
      ).catch((err) =>
        assert.throws(() => { throw err; }, /doesn't contain an .hz directory/)
      );
    });

    it('continues if .hz dir does exist', () =>
      serve.run(make_args([ project_name ]), Promise.resolve())
    );
  });

  describe('without a project path', () => {
    beforeEach('initialize mockfs', () => mockFs(valid_project_data));

    it('does not change directories', () => {
      const before_dir = process.cwd();
      return serve.run(make_args([ '.' ]), Promise.resolve()).then(() =>
        assert.strictEqual(before_dir, process.cwd(), 'directory should not have changed')
      );
    });

    it('fails if the .hz dir does not exist', () => {
      mockFs({ });
      return serve.run(make_args([ '.' ]), Promise.resolve()).then(() =>
        assert(false, 'should have failed because the .hz directory is missing')
      ).catch((err) =>
        assert.throws(() => { throw err; }, /doesn't contain an .hz directory/)
      );
    });

    it('continues if .hz dir does exist', () =>
      serve.run(make_args([ '.' ]), Promise.resolve())
    );
  });
});
