'use strict';

const assert = require('chai').assert;
const mockFs = require('mock-fs');
const serve = require('../src/serve');

const global_args = [ '--secure=false' ];
const make_args = (args) => global_args.concat(args);

const valid_project_data = {
  '.hz': {
    'config.toml': 'project_name = "projectName"\n',
  },
};

describe('hz serve', () => {
  let rdb_server;

  before('start rethinkdb', () =>
    start_rdb_server({
      bind: ["127.0.0.1"],
      dataDir: tmpdir() + "/horizon-test",
    }).then((server) => {
      rdb_server = server;
    })
  );

  after('stop rethinkdb', () => rdb_server.close());
  afterEach('restore mockfs', () => mockFs.restore());

  describe('with a project path', () => {
    const args = make_args([ 'test-app' ]);

    beforeEach('initialize mockfs', () => mockFs({ 'test-app': valid_project_data }));

    it('changes to the project directory', () => {
      const before_dir = process.cwd();
      console.log(`running with args: ${args}`);
      return serve.run(args).then(() =>
        assert.strictEqual(`${before_dir}/test-app`, process.cwd(),
                           'directory should have changed')
      );
    });

    it("fails if the .hz dir doesn't exist", () => {
      mockFs({ 'test-app': {} });
      return serve.run(args).then(() =>
        assert(false, 'should have failed because the .hz directory is missing')
      ).catch((err) =>
        assert.throws(() => { throw err; }, /doesn't contain an .hz directory/)
      );
    });

    it('continues if .hz dir does exist', () =>
      serve.run(args)
    );
  });

  describe('without a project path', () => {
    const args = make_args([ '.' ]);

    beforeEach('initialize mockfs', () => mockFs(valid_project_data));

    it("doesn't change directories", () => {
      const before_dir = process.cwd();
      return serve.run(args).then(() =>
        assert.strictEqual(before_dir, process.cwd(), 'directory should not have changed')
      );
    });

    it("fails if the .hz dir doesn't exist", (done) => {
      mockFs({ });
      return serve.run(args).then(() =>
        assert(false, 'should have failed because the .hz directory is missing')
      ).catch((err) =>
        assert.throws(() => { throw err; }, /doesn't contain an .hz directory/)
      );
    });

    it('continues if .hz dir does exist', () =>
      serve.run(args)
    );
  });
});
