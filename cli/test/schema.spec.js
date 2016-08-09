'use strict';

const processApplyConfig = require('../src/schema').processApplyConfig;
const runApplyCommand = require('../src/schema').runApplyCommand;
const runSaveCommand = require('../src/schema').runSaveCommand;
const parse_schema = require('../src/schema').parse_schema;
const start_rdb_server = require('../src/utils/start_rdb_server');
const rm_sync_recursive = require('../src/utils/rm_sync_recursive');

const assert = require('assert');
const fs = require('fs');

const r = start_rdb_server.r;
const mockFs = require('mock-fs');
const tmpdir = require('os').tmpdir;

const project_name = 'schema_test';

const v1_schema = ` 
[collections.test_messages]
indexes = ["datetime"]

[groups.admin]
[groups.admin.rules.carte_blanche]
template = "any()"
`;

const v2_schema = `# This is a TOML document

[collections.users]

[collections.test_messages]
[[collections.test_messages.indexes]]
fields = [["a","b"],["c"]]
[[collections.test_messages.indexes]]
fields = [["datetime"]]

[groups.admin]
[groups.admin.rules.carte_blanche]
template = "any()"
`;

const brokenTestSchema = `
[collectiosfklajsfns.test_messages]
indexes = ["datetime"]

[groups.adminasklfjasf]
[groups.admin.rules.carte_blanche]
template = "any()a;lkdfjlakjf;ladkfjal;kfj"
`;

const fs_with_schema = (schema) => {
  mockFs({ '.hz': { 'schema.toml': schema } });
};

describe('hz schema', () => {
  const rdb_data_dir = `${tmpdir()}/horizon-test-${process.pid}`;
  let rdb_conn, rdb_server;

  before('start rethinkdb', () =>
    start_rdb_server({
      quiet: true,
      dataDir: rdb_data_dir,
    }).then((server) => {
      rdb_server = server;
    })
  );

  after('stop rethinkdb', () => rdb_server && rdb_server.close());
  after('delete rethinkdb data directory', () => rm_sync_recursive(rdb_data_dir));

  before('connect to rethinkdb', () =>
    rdb_server.connect().then((conn) => {
      rdb_conn = conn;
    })
  );

  beforeEach('initialize mockfs', () => fs_with_schema(v2_schema));
  afterEach('restore fs', () => mockFs.restore());

  describe('save', () => {
    before('initialize database', () => {
      fs_with_schema(v2_schema);
      return runApplyCommand(processApplyConfig({
        start_rethinkdb: false,
        schema_file: '.hz/schema.toml',
        project_name,
        connect: `localhost:${rdb_server.driver_port}`,
      }));
    });

    after('clear database', () =>
      r.branch(
        r.dbList().contains(project_name),
        r.dbDrop(project_name),
        null
      ).run(rdb_conn)
    );

    it('renames previous schema.toml if it already exists', () =>
      runSaveCommand({
        start_rethinkdb: false,
        rdb_host: 'localhost',
        rdb_port: rdb_server.driver_port,
        out_file: '.hz/schema.toml',
        project_name,
      }).then(() =>
        assert.equal(fs.readdirSync('.hz').length, 2, 'backup schema file not created')
      )
    );

    it('saves schema to schema.toml from rdb', () =>
      runSaveCommand({
        start_rethinkdb: false,
        rdb_host: 'localhost',
        rdb_port: rdb_server.driver_port,
        out_file: 'out.toml',
        project_name,
      }).then(() =>
        assert.strictEqual(fs.readFileSync('out.toml', 'utf8'), v2_schema)
      )
    );
  });

  describe('apply', () => {
    afterEach('clear database', () =>
      r.branch(
        r.dbList().contains(project_name),
        r.dbDrop(project_name),
        null
      ).run(rdb_conn)
    );

    it('applies v1.x schema to rdb from schema.toml', () => {
      fs_with_schema(v1_schema);
      const config = processApplyConfig({
        connect: `localhost:${rdb_server.driver_port}`,
        schema_file: '.hz/schema.toml',
        start_rethinkdb: false,
        update: true,
        force: true,
        secure: false,
        permissions: false,
        project_name,
      });

      // Apply settings into RethinkDB
      return runApplyCommand(config).then(() =>
        // Check that the project database exists
        r.dbList().contains(project_name).run(rdb_conn)
      ).then((res) =>
        assert(res, `${project_name} database is missing.`)
      ).then(() =>
        r.db(project_name).table('test_messages').indexList().run(rdb_conn)
      ).then((indexes) => {
        // Check that the expected indexes exist on the expected table
        assert(indexes.indexOf('hz_[["datetime"]]') !== -1, '"datetime" index is missing');
      });
    });

    it('applies v2.x schema to rdb from schema.toml', () => {
      const config = processApplyConfig({
        connect: `localhost:${rdb_server.driver_port}`,
        schema_file: '.hz/schema.toml',
        start_rethinkdb: false,
        update: true,
        force: true,
        secure: false,
        permissions: false,
        project_name,
      });

      // Apply settings into RethinkDB
      return runApplyCommand(config).then(() =>
        // Check that the project database exists
        r.dbList().contains(project_name).run(rdb_conn)
      ).then((res) =>
        assert(res, `${project_name} database is missing.`)
      ).then(() =>
        r.db(project_name).table('test_messages').indexList().run(rdb_conn)
      ).then((indexes) => {
        // Check that the expected indexes exist on the expected table
        assert(indexes.indexOf('hz_[["datetime"]]') !== -1, '"datetime" index is missing');
        assert(indexes.indexOf('hz_[["a","b"],["c"]]') !== -1, '[["a","b"],["c"]] index is missing');
      });
    });
  });

  describe('given a schema.toml file', () => {
    it('can parse a valid v1.x schema.toml file', () => {
      parse_schema(v1_schema);
    });

    it('can parse a valid v2.x schema.toml file', () => {
      parse_schema(v2_schema);
    });

    it('fails parsing invalid schema.toml file', () => {
      assert.throws(() => {
        parse_schema(brokenTestSchema);
      }, /"collectiosfklajsfns" is not allowed/);
    });

    it('can read a vaild schema.toml file', () =>
      processApplyConfig({
        start_rethinkdb: true,
        schema_file: '.hz/schema.toml',
        update: true,
        force: true,
      })
    );
  });
});
