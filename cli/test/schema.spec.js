'use strict';
const r = require('rethinkdb');
const assert = require('chai').assert;
const mockFs = require('mock-fs');
const tmpdir = require('os').tmpdir;
// const sinon = require('sinon');
const processLoadConfig = require("../src/schema").processLoadConfig;
const runLoadCommand = require('../src/schema').runLoadCommand;
const runSaveCommand = require('../src/schema').runSaveCommand;
const parse_schema = require('../src/schema').parse_schema;
const fs = require('fs');
const start_rethinkdb_server = require("../src/utils/start_rdb_server");
// const joi = require('joi/schemas');

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

parse_schema(testSchema)
const currentOpts = {};
describe("hz schema", () => {
  before(() => {
    // Start RethinkDB server
    return new Promise((resolve, reject) => {
      start_rethinkdb_server({
        driverPort: 38015,
        bind: ["127.0.0.1"],
        dataDir: tmpdir() + "/horizon-test",
        db: "horizon_schema_test"
      }).then((server) => {
        currentOpts.dbPort = server.driverPort;
        resolve();
      }).catch((err) => {
        console.log(err)
      });
    });
  });

  describe("hz schema save", () => {
    
    beforeEach('set up database state', () => {
      // Create MockFS
      mockFs({
          '.hz': {
            'schema.toml': testSchema,
          },
          'out.toml': '',
      });

      // Load default schema into rethinkdb to read from
      const config = processLoadConfig({  
        start_rethinkdb: false,
        schema_file: `.hz/schema.toml`,
        project_name: 'horizon_schema_test',
        connect: '127.0.0.1:' + currentOpts.dbPort,
      });
      return runLoadCommand(config, false).catch(err => console.log);
    });

    afterEach('restore mockfs and drop dbs from rdb', () => {
      mockFs.restore();

      // Remove default schema from rethinkdb
      return r.connect('localhost', currentOpts.dbPort).then((conn) => {
        r.branch(
          r.dbList().contains(['horizon_schema_test', 'horizon_schema_test_internal']),
          r.dbDrop(['horizon_schema_test', 'horizon_schema_test_internal']),
          r.dbList().contains('horizon_schema_test'),
          r.dbDrop('horizon_schema_test'),
          r.dbList().contains('horizon_schema_test_internal'),
          r.dbDrop('horizon_schema_test_internal'),
          null
        ).run(conn);
      }).catch(console.log);
    });

    it("saves schema to schema.toml from rdb", () => {
      return runSaveCommand({
        start_rethinkdb: false,
        rdb_host: '127.0.0.1',
        rdb_port: currentOpts.dbPort,
        out_file: fs.createWriteStream('out.toml', {flags: 'w'}),
        project_name: 'horizon_schema_test',
      }).then(() => {
        assert.equal(fs.readFileSync('out.toml', 'utf8'), testSchema);
        
      });
    });
  });

  describe("hz schema load", () => {
    beforeEach(() => {
      mockFs({
          '.hz': {
            'schema.toml': testSchema,
          },
      });
    });

    it("should load schema to rdb from schema.toml", () => {
      let rethinkdb_conn;
      const createdConfig = processLoadConfig({
        connect: "localhost:" + currentOpts.dbPort,
        schema_file: '.hz/schema.toml',
        start_rethinkdb: false, 
        update: true,
        force: true,
        secure: false,
        permissions: false,
        project_name: 'horizon_schema_test',
      });

      // Load settings into RethinkDB
      return runLoadCommand(createdConfig, false).then((RLCresult) => {
        
        // Make connection to test RethinkDB instance
        return r.connect({ host: '127.0.0.1', port: currentOpts.dbPort});
      
      }).then((conn) => {
      
        rethinkdb_conn = conn;
        // Assert both databases are created 
        const expected_databases = ['horizon_schema_test', 'horizon_schema_test_internal'];
        return Promise.all(expected_databases.map((table_name) => {
          return new r.dbList().run(rethinkdb_conn).then((result) => {
            assert.include(result, table_name, 'Tables include horizon_test');  
          });
        }));
      }).then(() => {
        // Assert index is created, have to do tableList first because of number ending on table names currently
        return r.db('horizon_schema_test').tableList().run(rethinkdb_conn)
          .then((table_names) => {
            r.db('horizon_schema_test').table(table_names[0]).indexList().run(rethinkdb_conn)
            .then((result) => {
              assert.include(result, 'datetime', '"datetime" index not included')
            });
          });
        });
      });
    });
  
  describe("given a schema.toml file", () => {
    beforeEach(() => {
      mockFs({
          '.hz': {
            'schema.toml': testSchema,
          },
      });
    });
    afterEach(() => {
      mockFs.restore();
    });
    it('can parse a valid schema.toml file', (done) => {
      const schema = parse_schema(testSchema);
      done();
    });
    it('fails parsing invalid schema.toml file', (done) => {
      try {
        const schema = parse_schema(brokenTestSchema);
      } catch (e) {
        assert(e.name === "ValidationError");
      }
      done();
    });
    it('can read a vaild schema.toml file', (done) => {
        const createdConfig = processLoadConfig({
            start_rethinkdb: true, 
            schema_file: '.hz/schema.toml',
            update: true,
            force: true,
        });
        done();
    });
  });
});