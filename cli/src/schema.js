'use strict';
const schema = module.exports = {}

const create_collection_reql = require('@horizon/server/src/metadata/metadata').create_collection_reql;
const fs = require('fs');
const initialize_metadata_reql = require('@horizon/server/src/metadata/metadata').initialize_metadata_reql;
const interrupt = require('./utils/interrupt');
const Joi = require('joi');
const logger = require('@horizon/server').logger;
const name_to_fields = require('@horizon/server/src/metadata/index').Index.name_to_fields;
const parse_yes_no_option = require('./utils/parse_yes_no_option');
const path = require('path');
const r = require('rethinkdb');
const serve = require('./serve');
const start_rdb_server = require('./utils/start_rdb_server');
const toml = require('toml');

const helpText = 'Load and save the schema from a horizon database';

const addArguments = (parser) => {

  const subparsers = parser.addSubparsers({
    title: 'subcommands',
    dest: 'subcommand_name'
  });

  // HZ SCHEMA LOAD
  const load = subparsers.addParser('apply', { addHelp: true });

  load.addArgument([ 'project_path' ], {
    type: 'string',
    nargs: '?',
    help: 'Change to this directory before serving'
  });

  load.addArgument([ '--project-name', '-n' ], {
    type: 'string',
    action: 'store', metavar: 'NAME',
    help: 'Name of the Horizon Project server',
  });

  load.addArgument([ '--connect', '-c' ], {
    type: 'string',
    metavar: 'HOST:PORT',
    help: 'Host and port of the RethinkDB server to connect to.',
  });

  load.addArgument([ '--start-rethinkdb' ], {
    type: 'string',
    metavar: 'yes|no', constant: 'yes', nargs: '?',
    help: 'Start up a RethinkDB server in the current directory',
  });

  load.addArgument([ '--config' ], {
    type: 'string',
    metavar: 'PATH',
    help: 'Path to the config file to use, defaults to ".hz/config.toml".',
  });

  load.addArgument([ '--debug' ], {
    type: 'string',
    metavar: 'yes|no', constant: 'yes', nargs: '?',
    help: 'Enable debug logging.',
  });

  load.addArgument([ '--update' ], {
    type: 'string',
    metavar: 'yes|no', constant: 'yes', nargs: '?',
    help: 'Only add new items and update existing, no removal.',
  });

  load.addArgument([ '--force' ], {
    type: 'string',
    metavar: 'yes|no', constant: 'yes', nargs: '?',
    help: 'Allow removal of existing collections.',
  });

  load.addArgument([ 'schema_file' ], {
    type: 'string',
    metavar: 'SCHEMA_FILE_PATH',
    help: 'File to get the horizon schema from, use "-" for stdin.',
  });

  // HZ SCHEMA SAVE
  const save = subparsers.addParser('save', { addHelp: true });

  save.addArgument([ 'project_path' ], {
    type: 'string',
    nargs: '?',
    help: 'Change to this directory before serving',
  });

  save.addArgument([ '--project-name', '-n' ], {
    type: 'string',
    action: 'store',
    metavar: 'NAME',
    help: 'Name of the Horizon Project server',
  });

  save.addArgument([ '--connect', '-c' ], {
    type: 'string',
    metavar: 'HOST:PORT',
    help: 'Host and port of the RethinkDB server to connect to.',
  });

  save.addArgument([ '--start-rethinkdb' ], {
    type: 'string',
    metavar: 'yes|no',
    constant: 'yes',
    nargs: '?',
    help: 'Start up a RethinkDB server in the current directory',
  });

  save.addArgument([ '--config' ], {
    type: 'string',
    metavar: 'PATH',
    help: 'Path to the config file to use, defaults to ".hz/config.toml".',
  });

  save.addArgument([ '--debug' ], {
    type: 'string',
    metavar: 'yes|no',
    constant: 'yes',
    nargs: '?',
    help: 'Enable debug logging.',
  });

  save.addArgument([ '--out-file', '-o' ], {
    type: 'string',
    metavar: 'PATH',
    defaultValue: '.hz/schema.toml',
    help: 'File to write the horizon schema to, defaults to .hz/schema.toml.',
  });
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

const processLoadConfig = (parsed) => {
  let config, in_file;

  config = serve.make_default_config();
  config.start_rethinkdb = true;

  config = serve.merge_configs(config, serve.read_config_from_config_file(parsed.project_path,
                                                                   parsed.config));
  config = serve.merge_configs(config, serve.read_config_from_env());
  config = serve.merge_configs(config, serve.read_config_from_flags(parsed));
  if (parsed.schema_file === '-') {
    in_file = process.stdin;
  } else {
    in_file = fs.createReadStream(parsed.schema_file, {flags: 'r'});
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

const processSaveConfig = (parsed) => {
  let config, out_file;

  config = serve.make_default_config();
  config.start_rethinkdb = true;

  config = serve.merge_configs(config, serve.read_config_from_config_file(parsed.project_path,
                                                                   parsed.config));
  config = serve.merge_configs(config, serve.read_config_from_env());
  config = serve.merge_configs(config, serve.read_config_from_flags(parsed));

  if (parsed.out_file === '-') {
    out_file = process.stdout;
  } else {
    out_file = fs.createWriteStream(parsed.out_file, { flags: 'w', defaultEncoding: 'utf8',});
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
    out_file,
  };
};

const config_to_toml = (collections, groups) => {
  const res = [ '# This is a TOML document' ];

  for (const c of collections) {
    res.push('');
    res.push(`[collections.${c.id}]`);
    if (c.indexes.length > 0) {
      res.push(`indexes = ${JSON.stringify(c.indexes)}`);
    }
  }

  for (const g of groups) {
    res.push('');
    res.push(`[groups.${g.id}]`);
    if (g.rules) {
      for (const key in g.rules) {
        const template = g.rules[key].template;
        const validator = g.rules[key].validator;
        res.push(`[groups.${g.id}.rules.${key}]`);
        res.push(`template = ${JSON.stringify(template)}`);
        if (validator) {
          res.push(`validator = ${JSON.stringify(validator)}`);
        }
      }
    }
  }

  res.push('');
  return res.join('\n');
};

const runLoadCommand = (options, shutdown, done) => {
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
      console.log('Initialized new application metadata.');
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
    if (options.update) {
      // Update groups
      return Promise.all(schema.groups.map((group) => {
        const literal_group = JSON.parse(JSON.stringify(group));
        Object.keys(literal_group.rules).forEach((key) => {
          literal_group.rules[key] = r.literal(literal_group.rules[key]);
        });

        return r.db(internal_db).table('groups')
          .get(group.id).replace((old_row) =>
            r.branch(old_row.eq(null),
                     group,
                     old_row.merge(literal_group)))
          .run(conn).then((res) => {
            if (res.errors) {
              throw new Error(`Failed to update group: ${res.first_error}`);
            }
          });
      }));
    } else {
      // Replace and remove groups
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
    if(shutdown){ 
      interrupt.shutdown();
    } 
  }).catch(done);
};

const runSaveCommand = (options, done, shutdown) => {
  const db = options.project_name;
  const internal_db = `${db}_internal`;
  let conn;

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
    resolve(options.start_rethinkdb &&
            start_rdb_server().then((rdbOpts) => {
              options.rdb_host = 'localhost';
              options.rdb_port = rdbOpts.driverPort;
            }));
  }).then(() =>
    r.connect({ host: options.rdb_host,
                port: options.rdb_port })
  ).then((rdb_conn) => {
    conn = rdb_conn;
    return r.db(internal_db)
      .wait({ waitFor: 'ready_for_reads', timeout: 30 })
      .run(conn);
  }).then(() =>
    r.object('collections',
             r.db(internal_db).table('collections').coerceTo('array')
               .map((row) =>
                 row.merge({ indexes: r.db(db).table(row('table')).indexList() })),
             'groups', r.db(internal_db).table('groups').coerceTo('array'))
      .run(conn)
  ).then((res) => {
    conn.close();
    const toml_str = config_to_toml(res.collections, res.groups);
    options.out_file.write(toml_str);
    options.out_file.close();
  }).then(() => {
    if (shutdown){
      interrupt.shutdown()
    }
  }).catch( (err) => {
    console.log(err);
    done(err);
  });
};


// Avoiding cyclical depdendencies
schema.addArguments = addArguments;
schema.processConfig = (options) => {
  // Determine if we are saving or loading and use appropriate config processing
  if (options.hasOwnProperty('force') || options.hasOwnProperty('update')) {
    return processLoadConfig(options);
  } else {
    return processSaveConfig(options);
  }
};
schema.runCommand = (options, done) => {
  // Determine if we are saving or loading and use appropriate runCommand
  //  Also shutdown = true in this case since we are calling from the CLI. 
  if (options.hasOwnProperty('force') || options.hasOwnProperty('update')) {
    return runLoadCommand(options, true, done);
  } else {
    return runSaveCommand(options, true, done);
  }
};
schema.helpText = helpText;
schema.processLoadConfig = processLoadConfig;
schema.runLoadCommand = runLoadCommand;
schema.runSaveCommand = runSaveCommand;
schema.parse_schema = parse_schema;
