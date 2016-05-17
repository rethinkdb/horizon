'use strict';

const interrupt = require('./utils/interrupt');
const parse_yes_no_option = require('./utils/parse_yes_no_option');
const start_rdb_server = require('./utils/start_rdb_server');
const serve = require('./serve');
const logger = require('@horizon/server').logger;
const create_collection_reql = require('@horizon/server/src/metadata').create_collection_reql;
const initialize_metadata_reql = require('@horizon/server/src/metadata').initialize_metadata_reql;
const name_to_fields = require('@horizon/server/src/index').Index.name_to_fields;

const fs = require('fs');
const Joi = require('joi');
const path = require('path');
const r = require('rethinkdb');
const toml = require('toml');

const addArguments = (parser) => {
  parser.addArgument([ 'project_path' ],
    { type: 'string', nargs: '?',
      help: 'Change to this directory before serving' });

  parser.addArgument([ '--project-name', '-n' ],
    { type: 'string', action: 'store', metavar: 'NAME',
      help: 'Name of the Horizon Project server' });

  parser.addArgument([ '--connect', '-c' ],
    { type: 'string', metavar: 'HOST:PORT',
      help: 'Host and port of the RethinkDB server to connect to.' });

  parser.addArgument([ '--start-rethinkdb' ],
    { type: 'string', metavar: 'yes|no', constant: 'yes', nargs: '?',
      help: 'Start up a RethinkDB server in the current directory' });

  parser.addArgument([ '--config' ],
    { type: 'string', metavar: 'PATH',
      help: 'Path to the config file to use, defaults to ".hz/config.toml".' });

  parser.addArgument([ '--debug' ],
    { type: 'string', metavar: 'yes|no', constant: 'yes', nargs: '?',
      help: 'Enable debug logging.' });

  parser.addArgument([ '--update' ],
    { type: 'string', metavar: 'yes|no', constant: 'yes', nargs: '?',
      help: 'Only add new items and update existing, no removal.' });

  parser.addArgument([ '--force' ],
    { type: 'string', metavar: 'yes|no', constant: 'yes', nargs: '?',
      help: 'Allow removal of existing collections.' });

  parser.addArgument([ 'schema_file' ],
    { type: 'string', metavar: 'PATH',
      help: 'File to get the horizon schema from, use "-" for stdin.' });
};

const processConfig = (parsed) => {
  let config, in_file;

  config = serve.make_default_config();
  config.start_rethinkdb = true;

  config = serve.merge_configs(config, serve.read_config_from_file(parsed.project_path,
                                                                   parsed.config));
  config = serve.merge_configs(config, serve.read_config_from_env());
  config = serve.merge_configs(config, serve.read_config_from_flags(parsed));

  if (parsed.schema_file === '-') {
    in_file = process.stdin;
  } else {
    in_file = fs.createReadStream(null, { fd: fs.openSync(parsed.schema_file, 'r') });
  }

  if (config.project_name === null) {
    config.project_name = path.basename(path.resolve(config.project_path));
  }

  return {
    start_rethinkdb: config.start_rethinkdb,
    rdb_host: config.rdb_host,
    rdb_port: config.rdb_port,
    project_name: config.project_name,
    project_path: config.project_path,
    debug: config.debug,
    update: parse_yes_no_option(parsed.update),
    force: parse_yes_no_option(parsed.force),
    in_file,
  };
};

const schema_schema = Joi.object().unknown(false).keys({
  collections: Joi.object().unknown(true).pattern(/.*/,
    Joi.object().unknown(false).keys({
      indexes: Joi.array().items(Joi.string().min(1)).default([ ]),
    })
  ).optional(),
  groups: Joi.object().unknown(true).pattern(/.*/,
    Joi.object().keys({
      rules: Joi.object().unknown(true).pattern(/.*/,
        Joi.object().unknown(false).keys({
          template: Joi.string().required(),
          validator: Joi.string().optional(),
        })
      ).optional().default({ }),
    })
  ).optional(),
});

const parse_schema = (schema_toml) => {
  const parsed = Joi.validate(toml.parse(schema_toml), schema_schema);
  const schema = parsed.value;

  if (parsed.error) {
    throw parsed.error;
  }

  const collections = [ ];
  if (schema.collections) {
    for (const name in schema.collections) {
      collections.push(Object.assign({ id: name }, schema.collections[name]));
    }
  }

  const groups = [ ];
  if (schema.groups) {
    for (const name in schema.groups) {
      groups.push(Object.assign({ id: name }, schema.groups[name]));
    }
  }

  return { groups, collections };
};

const runCommand = (options, done) => {
  let schema, conn;
  let obsolete_collections = [ ];

  const db = options.project_name;
  const internal_db = `${db}_internal`;

  logger.level = 'error';
  interrupt.on_interrupt((done2) => {
    if (conn) {
      conn.close();
    }
    done2();
  });

  if (options.start_rethinkdb) {
    serve.change_to_project_dir(options.project_path);
  }

  return new Promise((resolve) => {
    let schema_toml = '';
    options.in_file.on('data', (buffer) => (schema_toml += buffer));
    options.in_file.on('end', () => resolve(schema_toml));
  }).then((schema_toml) => {
    schema = parse_schema(schema_toml);

    return options.start_rethinkdb &&
      start_rdb_server().then((rdbOpts) => {
        options.rdb_port = rdbOpts.driverPort;
      });
  }).then(() =>
    // Connect to the database
    r.connect({ host: options.rdb_host,
                port: options.rdb_port })
  ).then((rdb_conn) => {
    conn = rdb_conn;
    return initialize_metadata_reql(r, internal_db, db).run(conn);
  }).then((initialization_result) => {
    if (initialization_result.tables_created) {
      console.log("Initialized new application metadata.");
    }
    // Wait for metadata tables to be writable
    return r.db(internal_db)
     .wait({ waitFor: 'ready_for_writes', timeout: 30 })
     .run(conn);
  }).then(() => {
    // Error if any collections will be removed
    if (!options.update) {
      return r.db(internal_db).table('collections')('id')
        .coerceTo('array')
        .setDifference(schema.collections.map((c) => c.id))
        .run(conn)
        .then((res) => {
          if (!options.force && res.length > 0) {
            throw new Error('Run with "--force" to continue.\n' +
                            'These collections would be removed along with their data:\n' +
                            `${res.join(', ')}`);
          }
          obsolete_collections = res;
        });
    }
  }).then(() => {
    // Update groups
    if (options.update) {
      for (const g of schema.groups) {
        for (const key in g.rules) {
          g.rules[key] = r.literal(g.rules[key]);
        }
      }
      return r.expr(schema.groups)
        .forEach((group) =>
          r.db(internal_db).table('groups')
            .get(group.id)
            .update(group))
        .run(conn);
    } else {
      const groups_obj = { };
      schema.groups.forEach((g) => { groups_obj[g.id] = g; });

      return Promise.all([
        r.expr(groups_obj).do((groups) =>
          r.db(internal_db).table('groups')
            .replace((old_row) =>
              r.branch(groups.hasFields(old_row('id')),
                       old_row,
                       null))
          ).run(conn).then((res) => {
            if (res.errors) {
              throw new Error(`Failed to write groups: ${res.first_error}`);
            }
          }),
        r.db(internal_db).table('groups')
          .insert(schema.groups, { conflict: 'replace' })
          .run(conn).then((res) => {
            if (res.errors) {
              throw new Error(`Failed to write groups: ${res.first_error}`);
            }
          }),
      ]);
    }
  }).then(() => {
    // Ensure all collections exist and remove any obsolete collections
    const promises = [ ];
    for (const c of schema.collections) {
      promises.push(
        create_collection_reql(r, internal_db, db, c.id)
          .run(conn).then((res) => {
            if (res.error) {
              throw new Error(res.error);
            }
          }));
    }

    for (const c of obsolete_collections) {
      promises.push(
        r.db(internal_db)
          .table('collections')
          .get(c)
          .delete({ returnChanges: 'always' })('changes')(0)
          .do((res) =>
            r.branch(res.hasFields('error'),
                     res,
                     res('old_val').eq(null),
                     res,
                     r.db(db).tableDrop(res('old_val')('table')).do(() => res)))
          .run(conn).then((res) => {
            if (res.error) {
              throw new Error(res.error);
            }
          }));
    }

    return Promise.all(promises);
  }).then(() => {
    const promises = [ ];

    // Determine the index fields of each index from the name
    for (const c of schema.collections) {
      c.index_fields = { };
      for (const index of c.indexes) {
        c.index_fields[index] = name_to_fields(index);
      }
    }

    // Ensure all indexes exist
    promises.push(
      r.expr(schema.collections)
        .forEach((c) =>
          r.db(internal_db).table('collections')
            .get(c('id'))
            .do((collection) =>
              c('indexes')
                .setDifference(r.db(db).table(collection('table')).indexList())
                .forEach((index) =>
                  c('index_fields')(index).do((fields) =>
                    r.db(db).table(collection('table')).indexCreate(index, (row) =>
                      fields.map((key) => row(key)))))))
        .run(conn)
        .then((res) => {
          if (res.errors) {
            throw new Error(`Failed to create indexes: ${res.first_error}`);
          }
        }));

    // Remove obsolete indexes
    if (!options.update) {
      promises.push(
        r.expr(schema.collections)
          .forEach((c) =>
            r.db(internal_db).table('collections')
              .get(c('id'))
              .do((row) =>
                r.db(db).table(row('table')).indexList()
                  .setDifference(c('indexes'))
                  .forEach((index) =>
                    r.db(db).table(row('table')).indexDrop(index))))
        .run(conn)
        .then((res) => {
          if (res.errors) {
            throw new Error(`Failed to create indexes: ${res.first_error}`);
          }
        }));
    }

    return Promise.all(promises);
  }).then(() => {
    conn.close();
    interrupt.shutdown();
  }).catch(done);
};

module.exports = {
  addArguments,
  processConfig,
  runCommand,
};
