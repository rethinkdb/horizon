'use strict';

const horizon_server = require('@horizon/server');
const horizon_index = require('@horizon/server/src/metadata/index');
const horizon_metadata = require('@horizon/server/src/metadata/metadata');

const config = require('./utils/config');
const interrupt = require('./utils/interrupt');
const start_rdb_server = require('./utils/start_rdb_server');
const parse_yes_no_option = require('./utils/parse_yes_no_option');
const change_to_project_dir = require('./utils/change_to_project_dir');
const initialize_joi = require('./utils/initialize_joi');

const fs = require('fs');
const Joi = require('joi');
const path = require('path');

const argparse = require('argparse');
const toml = require('toml');

const r = horizon_server.r;
const create_collection = horizon_metadata.create_collection;
const initialize_metadata = horizon_metadata.initialize_metadata;

initialize_joi(Joi);

const parseArguments = (args) => {
  const parser = new argparse.ArgumentParser({ prog: 'hz schema' });

  const subparsers = parser.addSubparsers({
    title: 'subcommands',
    dest: 'subcommand_name',
  });

  const apply = subparsers.addParser('apply', { addHelp: true });
  const save = subparsers.addParser('save', { addHelp: true });

  // Set options shared between both subcommands
  [ apply, save ].map((subcmd) => {
    subcmd.addArgument([ 'project_path' ],
      { type: 'string', nargs: '?',
        help: 'Change to this directory before serving' });

    subcmd.addArgument([ '--project-name', '-n' ],
      { type: 'string', action: 'store', metavar: 'NAME',
        help: 'Name of the Horizon Project server' });

    subcmd.addArgument([ '--connect', '-c' ],
      { type: 'string', metavar: 'HOST:PORT',
        help: 'Host and port of the RethinkDB server to connect to.' });

    subcmd.addArgument([ '--rdb-timeout' ],
      { type: 'int', metavar: 'TIMEOUT',
        help: 'Timeout period in seconds for the RethinkDB connection to be opened' });

    subcmd.addArgument([ '--rdb-user' ],
      { type: 'string', metavar: 'USER',
        help: 'RethinkDB User' });

    subcmd.addArgument([ '--rdb-password' ],
      { type: 'string', metavar: 'PASSWORD',
        help: 'RethinkDB Password' });

    subcmd.addArgument([ '--start-rethinkdb' ],
      { type: 'string', metavar: 'yes|no', constant: 'yes', nargs: '?',
        help: 'Start up a RethinkDB server in the current directory' });

    subcmd.addArgument([ '--debug' ],
      { type: 'string', metavar: 'yes|no', constant: 'yes', nargs: '?',
        help: 'Enable debug logging.' });
  });

  // Options exclusive to HZ SCHEMA APPLY
  apply.addArgument([ '--update' ],
    { type: 'string', metavar: 'yes|no', constant: 'yes', nargs: '?',
      help: 'Only add new items and update existing, no removal.' });

  apply.addArgument([ '--force' ],
    { type: 'string', metavar: 'yes|no', constant: 'yes', nargs: '?',
      help: 'Allow removal of existing collections.' });

  apply.addArgument([ 'schema_file' ],
    { type: 'string', metavar: 'SCHEMA_FILE_PATH',
      help: 'File to get the horizon schema from, use "-" for stdin.' });

  // Options exclusive to HZ SCHEMA SAVE
  save.addArgument([ '--out-file', '-o' ],
    { type: 'string', metavar: 'PATH', defaultValue: '.hz/schema.toml',
      help: 'File to write the horizon schema to, defaults to .hz/schema.toml.' });

  return parser.parseArgs(args);
};

const schema_schema = Joi.object().unknown(false).keys({
  collections: Joi.object().unknown(true).pattern(/.*/,
    Joi.object().unknown(false).keys({
      indexes: Joi.array().items(
        Joi.alternatives(
          Joi.string(),
          Joi.object().unknown(false).keys({
            fields: Joi.array().items(Joi.array().items(Joi.string())).required(),
          })
        )
      ).optional().default([ ]),
    })
  ).optional().default({ }),
  groups: Joi.object().unknown(true).pattern(/.*/,
    Joi.object().keys({
      rules: Joi.object().unknown(true).pattern(/.*/,
        Joi.object().unknown(false).keys({
          template: Joi.string().required(),
          validator: Joi.string().optional(),
        })
      ).optional().default({ }),
    })
  ).optional().default({ }),
});

// Preserved for interpreting old schemas
const v1_0_name_to_fields = (name) => {
  let escaped = false;
  let field = '';
  const fields = [ ];
  for (const c of name) {
    if (escaped) {
      if (c !== '\\' && c !== '_') {
        throw new Error(`Unexpected index name: "${name}"`);
      }
      escaped = false;
      field += c;
    } else if (c === '\\') {
      escaped = true;
    } else if (c === '_') {
      fields.push(field);
      field = '';
    } else {
      field += c;
    }
  }
  if (escaped) {
    throw new Error(`Unexpected index name: "${name}"`);
  }
  fields.push([ field ]);
  return fields;
};

const parse_schema = (schema_toml) => {
  const parsed = Joi.validate(toml.parse(schema_toml), schema_schema);
  const schema = parsed.value;

  if (parsed.error) {
    throw parsed.error;
  }

  const collections = [ ];
  for (const name in schema.collections) {
    collections.push({
      id: name,
      indexes: schema.collections[name].indexes.map((index) => {
        if (typeof index === 'string') {
          return { fields: v1_0_name_to_fields(index), multi: false, geo: false };
        } else {
          return { fields: index.fields, multi: false, geo: false };
        }
      }),
    });
  }

  // Make sure the 'users' collection is present, as some things depend on
  // its existence.
  if (!schema.collections || !schema.collections.users) {
    collections.push({ id: 'users', indexes: [ ] });
  }

  const groups = [ ];
  for (const name in schema.groups) {
    groups.push(Object.assign({ id: name }, schema.groups[name]));
  }

  return { groups, collections };
};

const processApplyConfig = (parsed) => {
  let options, in_file;

  options = config.default_options();
  options = config.merge_options(options,
    config.read_from_config_file(parsed.project_path));
  options = config.merge_options(options, config.read_from_env());
  options = config.merge_options(options, config.read_from_flags(parsed));

  if (parsed.schema_file === '-') {
    in_file = process.stdin;
  } else {
    in_file = fs.createReadStream(parsed.schema_file, { flags: 'r' });
  }

  if (options.project_name === null) {
    options.project_name = path.basename(path.resolve(options.project_path));
  }

  return {
    subcommand_name: 'apply',
    start_rethinkdb: options.start_rethinkdb,
    rdb_host: options.rdb_host,
    rdb_port: options.rdb_port,
    rdb_user: options.rdb_user || undefined,
    rdb_password: options.rdb_password || undefined,
    project_name: options.project_name,
    project_path: options.project_path,
    debug: options.debug,
    update: parse_yes_no_option(parsed.update),
    force: parse_yes_no_option(parsed.force),
    in_file,
  };
};

const processSaveConfig = (parsed) => {
  let options, out_file;

  options = config.default_options();
  options.start_rethinkdb = true;

  options = config.merge_options(options,
    config.read_from_config_file(parsed.project_path));
  options = config.merge_options(options, config.read_from_env());
  options = config.merge_options(options, config.read_from_flags(parsed));

  if (parsed.out_file === '-') {
    out_file = process.stdout;
  } else {
    out_file = parsed.out_file;
  }

  if (options.project_name === null) {
    options.project_name = path.basename(path.resolve(options.project_path));
  }

  return {
    subcommand_name: 'save',
    start_rethinkdb: options.start_rethinkdb,
    rdb_host: options.rdb_host,
    rdb_port: options.rdb_port,
    rdb_user: options.rdb_user || undefined,
    rdb_password: options.rdb_password || undefined,
    project_name: options.project_name,
    project_path: options.project_path,
    debug: options.debug,
    out_file,
  };
};

const schema_to_toml = (collections, groups) => {
  const res = [ '# This is a TOML document' ];

  for (const c of collections) {
    res.push('');
    res.push(`[collections.${c.id}]`);
    c.indexes.forEach((index) => {
      const info = horizon_index.name_to_info(index);
      res.push(`[[collections.${c.id}.indexes]]`);
      res.push(`fields = ${JSON.stringify(info.fields)}`);
    });
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

const runApplyCommand = (options) => {
  let conn, schema, rdb_server;
  let obsolete_collections = [ ];
  const db = options.project_name;

  const cleanup = () =>
    Promise.all([
      conn ? conn.close() : Promise.resolve(),
      rdb_server ? rdb_server.close() : Promise.resolve(),
    ]);

  interrupt.on_interrupt(() => cleanup());

  return Promise.resolve().then(() => {
    if (options.start_rethinkdb) {
      change_to_project_dir(options.project_path);
    }

    return new Promise((resolve, reject) => {
      let schema_toml = '';
      options.in_file.on('data', (buffer) => (schema_toml += buffer));
      options.in_file.on('end', () => resolve(schema_toml));
      options.in_file.on('error', reject);
    });
  }).then((schema_toml) => {
    schema = parse_schema(schema_toml);

    if (options.start_rethinkdb) {
      return start_rdb_server({ quiet: !options.debug }).then((server) => {
        rdb_server = server;
        options.rdb_host = 'localhost';
        options.rdb_port = server.driver_port;
      });
    }
  }).then(() =>
    r.connect({ host: options.rdb_host,
                port: options.rdb_port,
                user: options.rdb_user,
                password: options.rdb_password,
                timeout: options.rdb_timeout })
  ).then((rdb_conn) => {
    conn = rdb_conn;
    return initialize_metadata(db, conn);
  }).then((initialization_result) => {
    if (initialization_result.tables_created) {
      console.log('Initialized new application metadata.');
    }
    // Wait for metadata tables to be writable
    return r.expr([ 'hz_collections', 'hz_groups' ])
      .forEach((table) =>
        r.db(db).table(table)
          .wait({ waitFor: 'ready_for_writes', timeout: 30 }))
      .run(conn);
  }).then(() => {
    // Error if any collections will be removed
    if (!options.update) {
      return r.db(db).table('hz_collections')
        .filter((row) => row('id').match('^hz_').not())
        .getField('id')
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

        return r.db(db).table('hz_groups')
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
          r.db(db).table('hz_groups')
            .replace((old_row) =>
              r.branch(groups.hasFields(old_row('id')),
                       old_row,
                       null))
          ).run(conn).then((res) => {
            if (res.errors) {
              throw new Error(`Failed to write groups: ${res.first_error}`);
            }
          }),
        r.db(db).table('hz_groups')
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
        create_collection(db, c.id, conn).then((res) => {
          if (res.error) {
            throw new Error(res.error);
          }
        }));
    }

    for (const c of obsolete_collections) {
      promises.push(
        r.db(db)
          .table('hz_collections')
          .get(c)
          .delete({ returnChanges: 'always' })('changes')(0)
          .do((res) =>
            r.branch(res.hasFields('error'),
                     res,
                     res('old_val').eq(null),
                     res,
                     r.db(db).tableDrop(res('old_val')('id')).do(() => res)))
          .run(conn).then((res) => {
            if (res.error) {
              throw new Error(res.error);
            }
          }));
    }

    return Promise.all(promises);
  }).then(() => {
    const promises = [ ];

    // Ensure all indexes exist
    for (const c of schema.collections) {
      for (const info of c.indexes) {
        const name = horizon_index.info_to_name(info);
        promises.push(
          r.branch(r.db(db).table(c.id).indexList().contains(name), { },
                   r.db(db).table(c.id).indexCreate(name, horizon_index.info_to_reql(info),
                     { geo: Boolean(info.geo), multi: (info.multi !== false) }))
            .run(conn)
            .then((res) => {
              if (res.errors) {
                throw new Error(`Failed to create index ${name} ` +
                                `on collection ${c.id}: ${res.first_error}`);
              }
            }));
      }
    }

    // Remove obsolete indexes
    if (!options.update) {
      for (const c of schema.collections) {
        const names = c.indexes.map(horizon_index.info_to_name);
        promises.push(
          r.db(db).table(c.id).indexList().filter((name) => name.match('^hz_'))
            .setDifference(names)
            .forEach((name) => r.db(db).table(c.id).indexDrop(name))
            .run(conn)
            .then((res) => {
              if (res.errors) {
                throw new Error('Failed to remove old indexes ' +
                                `on collection ${c.id}: ${res.first_error}`);
              }
            }));
      }
    }

    return Promise.all(promises);
  }).then(cleanup).catch((err) => cleanup().then(() => { throw err; }));
};

const file_exists = (filename) => {
  try {
    fs.accessSync(filename);
  } catch (e) {
    return false;
  }
  return true;
};

const runSaveCommand = (options) => {
  let conn, rdb_server;
  const db = options.project_name;

  const cleanup = () =>
    Promise.all([
      conn ? conn.close() : Promise.resolve(),
      rdb_server ? rdb_server.close() : Promise.resolve(),
    ]);

  interrupt.on_interrupt(() => cleanup());

  return Promise.resolve().then(() => {
    if (options.start_rethinkdb) {
      change_to_project_dir(options.project_path);
    }
  }).then(() => {
    if (options.start_rethinkdb) {
      return start_rdb_server({ quiet: !options.debug }).then((server) => {
        rdb_server = server;
        options.rdb_host = 'localhost';
        options.rdb_port = server.driver_port;
      });
    }
  }).then(() =>
    r.connect({ host: options.rdb_host,
                port: options.rdb_port,
                user: options.rdb_user,
                password: options.rdb_password,
                timeout: options.rdb_timeout })
  ).then((rdb_conn) => {
    conn = rdb_conn;
    return r.db(db).wait({ waitFor: 'ready_for_reads', timeout: 30 }).run(conn);
  }).then(() =>
    r.object('collections',
             r.db(db).table('hz_collections')
               .filter((row) => row('id').match('^hz_').not())
               .coerceTo('array')
               .map((row) =>
                 row.merge({ indexes: r.db(db).table(row('id')).indexList() })),
             'groups', r.db(db).table('hz_groups').coerceTo('array'))
      .run(conn)
  ).then((res) =>
    new Promise((resolve) => {
      // Only rename old file if saving to default .hz/schema.toml
      if (options.out_file === '.hz/schema.toml' &&
          file_exists(options.out_file)) {
        // Rename existing file to have the current time appended to its name
        const oldPath = path.resolve(options.out_file);
        const newPath = `${path.resolve(options.out_file)}.${new Date().toISOString()}`;
        fs.renameSync(oldPath, newPath);
      }

      const output = (options.out_file === '-') ? process.stdout :
        fs.createWriteStream(options.out_file, { flags: 'w', defaultEncoding: 'utf8' });

      // Output toml_str to schema.toml
      const toml_str = schema_to_toml(res.collections, res.groups);
      output.end(toml_str, resolve);
    })
  ).then(cleanup).catch((err) => cleanup().then(() => { throw err; }));
};

const processConfig = (options) => {
  // Determine if we are saving or applying and use appropriate config processing
  switch (options.subcommand_name) {
  case 'apply':
    return processApplyConfig(options);
  case 'save':
    return processSaveConfig(options);
  default:
    throw new Error(`Unrecognized schema subcommand: "${options.subcommand_name}"`);
  }
};

// Avoiding cyclical depdendencies
module.exports = {
  run: (args) =>
    Promise.resolve().then(() => {
      const options = processConfig(parseArguments(args));
      // Determine if we are saving or applying and use appropriate run function
      switch (options.subcommand_name) {
      case 'apply':
        return runApplyCommand(options);
      case 'save':
        return runSaveCommand(options);
      default:
        throw new Error(`Unrecognized schema subcommand: "${options.subcommand_name}"`);
      }
    }),
  description: 'Apply and save the schema from a horizon database',
  processApplyConfig,
  runApplyCommand,
  runSaveCommand,
  parse_schema,
};
