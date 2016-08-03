'use strict';
const start_rdb_server = require("../src/utils/start_rdb_server");
const processApplyConfig = require("../src/schema").processApplyConfig;
const runApplyCommand = require('../src/schema').runApplyCommand;
const runSaveCommand = require('../src/schema').runSaveCommand;
const parse_schema = require('../src/schema').parse_schema;

const assert = require('assert');
const fs = require('fs');

const r = start_rdb_server.r;
const mockFs = require('mock-fs');
const tmpdir = require('os').tmpdir;

const project_name = 'schema_test';

const testSchema = `# This is a TOML document

[collections.test_messages]
indexes = ["datetime"]

[groups.admin]
[groups.admin.rules.carte_blanche]
template = "any()"
`

const brokenTestSchema = `
[collectiosfklajsfns.test_messages]
indexes = ["datetime"]

[groups.adminasklfjasf]
[groups.admin.rules.carte_blanche]
template = "any()a;lkdfjlakjf;ladkfjal;kfj"
`

const valid_file_system = {
  '.hz': {
    'schema.toml': testSchema,
  },
};

const currentOpts = { };

describe("hz schema", () => {
  let rdb_server;
  let rdb_conn;

  before('start rethinkdb', () =>
    start_rdb_server({
      bind: ["127.0.0.1"],
      dataDir: tmpdir() + "/horizon-test",
    }).then((server) => {
      rdb_server = server;
    })
  );

  after('stop rethinkdb', () => rdb_server.close());

  before('connect to rethinkdb', () =>
    rdb_server.connect().then((conn) => {
      rdb_conn = conn;
    })
  );

  beforeEach('initialize mockfs', () => mockFs(valid_file_system));
  afterEach('restore fs', () => mockFs.restore());

  describe("hz schema save", () => {
    //beforeEach('initialize mockfs', () => {
    //  // Create MockFS
    //  mockFs({
    //    '.hz': {
    //      'schema.toml': testSchema,
    //    },
    //    'out.toml': '',
    //  });
    //});

    beforeEach('initialize database', () =>
      runApplyCommand(processApplyConfig({
        start_rethinkdb: false,
        schema_file: `.hz/schema.toml`,
        project_name,
        connect: '127.0.0.1:' + currentOpts.dbPort,
      }))
    );

    afterEach('clear database', () =>
      r.branch(
        r.dbList().contains(project_name),
        r.dbDrop(project_name),
        null
      ).run(rdb_conn)
    );

    it("renames previous schema.toml if it already exists", () => {
      mockFs({
        '.hz': {
          'schema.toml': '',
        },
      });
      runSaveCommand({
        start_rethinkdb: false,
        rdb_host: '127.0.0.1',
        rdb_port: currentOpts.dbPort,
        project_name: 'horizon_schema_test',
      }).then(() => {
        assert.equal(fs.readdirSync('.hz').length, 2, "backup schema file created")
      });
    });

    it("saves schema to schema.toml from rdb", () =>
      runSaveCommand({
        start_rethinkdb: false,
        rdb_host: '127.0.0.1',
        rdb_port: currentOpts.dbPort,
        out_file: fs.createWriteStream('out.toml', { flags: 'w' }),
        project_name: 'horizon_schema_test',
      }).then(() =>
        assert.strictEqual(fs.readFileSync('out.toml', 'utf8'), testSchema)
      )
    );
  });

  describe("hz schema apply", () => {

    it("should apply schema to rdb from schema.toml", () => {
      const config = processApplyConfig({
        connect: "localhost:" + currentOpts.dbPort,
        schema_file: '.hz/schema.toml',
        start_rethinkdb: false, 
        update: true,
        force: true,
        secure: false,
        permissions: false,
        project_name: 'horizon_schema_test',
      });

      // Apply settings into RethinkDB
      return runApplyCommand(config).then(() =>
        // Check that the project database exists
        r.dbList().contains(project_name).run(rdb_conn)
      ).then((res) =>
        assert(res, `${project_name} database is missing.`)
      ).then(() =>
        // Check that the expected indexes exist on the expected table
        r.db(project_name).table(table_names[0]).indexList().contains('datetime').run(rdb_conn)
      ).then((res) =>
        assert(res, '"datetime" index is missing')
      );
    });
  });
  
  describe("given a schema.toml file", () => {
    it('can parse a valid schema.toml file', () => {
      parse_schema(testSchema);
    });

    it('fails parsing invalid schema.toml file', () => {
      assert.throws(() => {
        parse_schema(brokenTestSchema);
      }, /"collectiosfklajsfns" is not allowed/);
    });

    it('can read a vaild schema.toml file', () => {
      const createdConfig = processApplyConfig({
        start_rethinkdb: true, 
        schema_file: '.hz/schema.toml',
        update: true,
        force: true,
      });
    });
  });
});
