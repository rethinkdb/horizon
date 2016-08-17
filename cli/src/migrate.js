'use strict';
const chalk = require('chalk');
const r = require('rethinkdb');
const Promise = require('bluebird');
const argparse = require('argparse');
const child_process = require('child_process');
const runSaveCommand = require('./schema').runSaveCommand;
const fs = require('fs');
const accessAsync = Promise.promisify(fs.access);
const config = require('./utils/config');
const interrupt = require('./utils/interrupt');
const change_to_project_dir = require('./utils/change_to_project_dir');
const parse_yes_no_option = require('./utils/parse_yes_no_option');
const start_rdb_server = require('./utils/start_rdb_server');

const VERSION_2_0 = [ 2, 0, 0 ];

function run(cmdArgs) {
  const options = processConfig(cmdArgs);
  interrupt.on_interrupt(() => teardown());
  return Promise.resolve().bind({ options })
    .then(setup)
    .then(validateMigration)
    .then(makeBackup)
    .then(renameUserTables)
    .then(moveInternalTables)
    .then(renameIndices)
    .then(rewriteHzCollectionDocs)
    .then(exportNewSchema)
    .finally(teardown);
}

function green() {
  const args = Array.from(arguments);
  args[0] = chalk.green(args[0]);
  console.log.apply(console, args);
}

function white() {
  const args = Array.from(arguments);
  args[0] = chalk.white(args[0]);
  console.log.apply(console, args);
}

function processConfig(cmdArgs) {
  // do boilerplate to get config args :/
  const parser = new argparse.ArgumentParser({ prog: 'hz migrate' });

  parser.addArgument([ 'project_path' ], {
    default: '.',
    nargs: '?',
    help: 'Change to this directory before migrating',
  });

  parser.addArgument([ '--project-name', '-n' ], {
    help: 'Name of the Horizon project server',
  });

  parser.addArgument([ '--connect', '-c' ], {
    metavar: 'host:port',
    default: undefined,
    help: 'Host and port of the RethinkDB server to connect to.',
  });

  parser.addArgument([ '--rdb-user' ], {
    default: 'admin',
    metavar: 'USER',
    help: 'RethinkDB User',
  });

  parser.addArgument([ '--rdb-password' ], {
    default: undefined,
    metavar: 'PASSWORD',
    help: 'RethinkDB Password',
  });

  parser.addArgument([ '--start-rethinkdb' ], {
    metavar: 'yes|no',
    default: 'yes',
    constant: 'yes',
    nargs: '?',
    help: 'Start up a RethinkDB server in the current directory'
  });

  parser.addArgument([ '--config' ], {
    default: '.hz/config.toml',
    help: 'Path to the config file to use, defaults to ".hz/config.toml".',
  });

  parser.addArgument([ '--skip-backup' ], {
    metavar: 'yes|no',
    default: 'no',
    constant: 'yes',
    nargs: '?',
    help: 'Whether to perform a backup of rethinkdb_data before migrating',
  });

  const parsed = parser.parseArgs(cmdArgs);
  const confOptions = config.read_from_config_file(parsed.project_path, parsed.config);
  const envOptions = config.read_from_env();
  config.merge_options(confOptions, envOptions);
  // Pull out the relevant settings from the config file
  const options = {
    project_path: parsed.project_path || '.',
    project_name: parsed.project_name || confOptions.project_name,
    rdb_host: parsed.rdb_host || confOptions.rdb_host || 'localhost',
    rdb_port: parsed.rdb_port || confOptions.rdb_port || 28015,
    rdb_user: parsed.rdb_user || confOptions.rdb_user || 'admin',
    rdb_password: parsed.rdb_password || confOptions.rdb_password || '',
    skip_backup: parse_yes_no_option(parsed.skip_backup),
    start_rethinkdb: parse_yes_no_option(parsed.start_rethinkdb),
  };
  // sets rdb_host and rdb_port from connect if necessary
  if (parsed.connect) {
    config.parse_connect(parsed.connect, options);
  }

  if (options.project_name == null) {
    throw new Error(
      'No project_name given: either pass the --project-name ' +
        'option or add the "project_name" key to your ' +
        '.hz/config.toml');
  }
  return options;
}

function setup() {
  // Start rethinkdb server if necessary
  // Connect to whatever rethinkdb server we're using
  white('Setup');
  return Promise.resolve().then(() => {
    if (this.options.project_path && this.options.project_path !== '.') {
      green(` ├── Changing to directory ${this.options.project_path}`);
      change_to_project_dir(this.options.project_path);
    }
  }).then(() => {
    // start rethinkdb server if necessary
    if (this.options.start_rethinkdb) {
      green(' ├── Starting RethinkDB server');
      return start_rdb_server({ quiet: true }).then((server) => {
        this.rdb_server = server;
        this.options.rdb_host = 'localhost';
        this.options.rdb_port = server.driver_port;
      });
    }
  }).then(() => {
    green(' ├── Connecting to RethinkDB');
    return r.connect({
      host: this.options.rdb_host,
      port: this.options.rdb_port,
      user: this.options.rdb_user,
      password: this.options.rdb_password,
    });
  }).then((conn) => {
    green(' └── Successfully connected');
    this.conn = conn;
  });
}

function teardown() {
  return Promise.resolve().then(() => {
    white('Cleaning up...');
    // close the rethinkdb connection
    if (this.conn) {
      green(' ├── Closing rethinkdb connection');
      return this.conn.close();
    }
  }).then(() => {
    // shut down the rethinkdb server if we started it
    if (this.rdb_server) {
      green(' └── Shutting down rethinkdb server');
      return this.rdb_server.close();
    }
  });
}

function validateMigration() {
  // check that `${project}_internal` exists
  const project = this.options.project_name;

  const checkForHzTables = r.db('rethinkdb')
          .table('table_config')
          .filter({ db: project })('name')
          .contains((x) => x.match('^hz_'))
          .branch(r.error(
            `Some tables in ${project} have an hz_ prefix`), true);
  const waitForCollections = r.db(`${project}_internal`)
          .table('collections')
          .wait({ timeout: 30 })
          .do(() => r.db(project).tableList())
          .forEach((tableName) =>
            r.db(project).table(tableName).wait({ timeout: 30 })
          );

  return Promise.resolve().then(() => {
    white('Validating current schema version');
    return r.dbList().contains(`${project}_internal`)
      .branch(true, r.error(
        `Database named '${project}_internal' wasn't found`))
      .do(() => checkForHzTables)
      .do(() => waitForCollections)
      .run(this.conn)
      .then(() => green(' └── Pre-2.0 schema found'))
      .catch((e) => {
        throw new Error(`\
${e.msg}.
This could happen if you don't have a Horizon app in this database \
or if you've already migrated to the version 2.0 format.`);
      });
  });
}

function makeBackup() {
  // shell out to rethinkdb dump
  const rdbHost = this.options.rdb_host;
  const rdbPort = this.options.rdb_port;

  if (this.options.skip_backup) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    white('Backing up rethinkdb_data directory');
    const proc = child_process.spawn('rethinkdb', [
      'dump',
      '--connect',
      `${rdbHost}:${rdbPort}`,
    ]);
    proc.on('exit', (code) => {
      if (code === 0) {
        green(' └── Backup completed');
        resolve();
      } else {
        proc.stderr.setEncoding('utf8');
        const err = proc.stderr.read();
        reject(new Error(`rethinkdb dump exited with an error:\n\n${err}`));
      }
    });
  });
}

function renameUserTables() {
  // for each table listed in ${project}_internal.collections
  // rename the table name to the collection name
  const project = this.options.project_name;
  return Promise.resolve().then(() => {
    white('Removing suffix from user tables');
    return r.db(`${project}_internal`).wait({ timeout: 30 }).
      do(() => r.db(`${project}_internal`).table('collections')
         .forEach((collDoc) => r.db('rethinkdb').table('table_config')
                  .filter({ db: project, name: collDoc('table') })
                  .update({ name: collDoc('id') }))
        ).run(this.conn)
      .then(() => green(' └── Suffixes removed'));
  });
}

function moveInternalTables() {
  // find project_internal
  // move all tables from ${project}_internal.${table} to ${project}.hz_${table}
  //   - except for users, don't add hz_prefix, but move its db
  const project = this.options.project_name;
  return Promise.resolve().then(() => {
    white(`Moving internal tables from ${project}_internal to ${project}`);
    return r.db('rethinkdb').table('table_config')
      .filter({ db: `${project}_internal` })
      .update((table) => ({
        db: project,
        name: r.branch(
          table('name').ne('users'),
          r('hz_').add(table('name')),
          'users'),
      })).run(this.conn)
      .then(() => green(' ├── Internal tables moved'));
  }).then(() => {
    // delete project_internal
    green(` └── Deleting empty "${project}_internal" database`);
    return r.dbDrop(`${project}_internal`).run(this.conn);
  });
}

function renameIndices() {
  // for each user $table in ${project}
  //    for each index in ${table}
  //        parse the old name into array of field names.
  //        rename to `hz_${JSON.stringify(fields)}`
  const project = this.options.project_name;
  return Promise.resolve().then(() => {
    white('Renaming indices to new JSON format');
    return r.db(project).tableList().forEach((tableName) => {
      return r.db(project).table(tableName).indexList().forEach((indexName) => {
        return r.db(project).table(tableName).indexRename(indexName, rename(indexName));
      });
    }).run(this.conn)
    .then(() => green(' └── Indices renamed.'));
  });

  function rename(name) {
    // ReQL to rename the index name to the new format
    const initialState = {
      escaped: false,
      field: '',
      fields: [ ],
    };
    return name.split('')
      .fold(initialState, (acc, c) => {
        return r.branch(
          acc('escaped'),
            acc.merge({
              escaped: false,
              field: acc('field').add(c),
            }),
          c.eq('\\'),
            acc.merge({ escaped: true }),
          c.eq('_'),
            acc.merge({
              fields: acc('fields').append(acc('field')),
              field: '',
            }),
          acc.merge({ field: acc('field').add(c) })
        );
      })
      .do((state) =>
          // last field needs to be appended to running list
          state('fields').append(state('field'))
          // wrap each field in an array
          .map((field) => [ field ])
         )
      .toJSON()
      .do((x) => r('hz_').add(x));
  }
}

function rewriteHzCollectionDocs() {
  // for each document in ${project}.hz_collections
  //   delete the table field
  const project = this.options.project_name;
  return Promise.resolve().then(() => {
    white('Rewriting hz_collections to new format');
    return r.db(project).table('hz_collections')
      .update({ table: r.literal() })
      .run(this.conn);
  }).then(() => green(' ├── "table" field removed'))
    .then(() => r.db(project).table('hz_collections')
          .insert({ id: 'users' })
          .run(this.conn))
    .then(() => green(' ├── Added document for "users" table'))
    .then(() => r.db(project).table('hz_collections')
          .insert({ id: 'hz_metadata', version: VERSION_2_0 })
          .run(this.conn))
    .then(() => green(' └── Adding the metadata document with schema version:' +
                      `${JSON.stringify(VERSION_2_0)}`));
}

function exportNewSchema() {
  // Import and run schema save process, giving it a different
  // filename than schema.toml
  const timestamp = new Date().toISOString().replace(/:/g, '_');
  return accessAsync('.hz/schema.toml', fs.R_OK | fs.F_OK)
    .then(() => `.hz/schema.toml.migrated.${timestamp}`)
    .catch(() => '.hz/schema.toml') // if no schema.toml
    .then((schemaFile) => {
      white(`Exporting the new schema to ${schemaFile}`);
      return runSaveCommand({
        rdb_host: this.options.rdb_host,
        rdb_port: this.options.rdb_port,
        rdb_user: this.options.rdb_user,
        rdb_password: this.options.rdb_password,
        out_file: schemaFile,
        project_name: this.options.project_name,
      });
    }).then(() => green(' └── Schema exported'));
}

module.exports = {
  run,
  description: 'migrate an older version of horizon to a newer one',
};
