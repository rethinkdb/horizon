'use strict';

const interrupt = require('./utils/interrupt');
const start_rdb_server = require('./utils/start_rdb_server');
const serve = require('./serve');
const logger = require('@horizon/server').logger;

const fs = require('fs');
const Joi = require('joi');
const r = require('rethinkdb');
const toml = require('toml');

const addArguments = (parser) => {
  parser.addArgument([ '--project' ],
    { type: 'string',
      help: 'Change to this directory before serving' });

  parser.addArgument([ '--connect', '-c' ],
    { type: 'string', metavar: 'HOST:PORT',
      help: 'Host and port of the RethinkDB server to connect to.' });

  parser.addArgument([ '--start-rethinkdb' ],
    { type: 'string', metavar: 'yes|no', constant: 'yes', nargs: '?',
      help: 'Start up a RethinkDB server in the current directory' });

  parser.addArgument([ '--config' ],
    { type: 'string', metavar: 'PATH',
      help: 'Path to the config file to use, defaults to ".hz/config.toml".' });

  parser.addArgument([ 'schema_file' ],
    { type: 'string', metavar: 'PATH',
      help: 'File to get the horizon schema from, use "-" for stdin.' });

  parser.addArgument([ '--debug' ],
    { type: 'string', metavar: 'yes|no', constant: 'yes', nargs: '?',
      help: 'Enable debug logging.' });

  parser.addArgument([ '--clear' ],
    { type: 'string', metavar: 'yes|no', constant: 'yes', nargs: '?',
      help: 'Clear existing schema before setting it.' });
};

const processConfig = (parsed) => {
  let config;
  
  config = serve.make_default_config();
  config = serve.merge_configs(config, serve.read_config_from_file(parsed.config));
  config = serve.merge_configs(config, serve.read_config_from_env());
  config = serve.merge_configs(config, serve.read_config_from_flags(parsed));

  let in_file;
  if (parsed.schema_file === '-') {
    in_file = process.stdin;
  } else {
    in_file = fs.createReadStream(null, { fd: fs.openSync(parsed.schema_file, 'r') });
  }

  return {
    start_rethinkdb: config.start_rethinkdb,
    rdb_host: config.rdb_host,
    rdb_port: config.rdb_port,
    project: config.project,
    debug: config.debug,
    in_file,
  };
};

const schema_schema = Joi.object().unknown(false).keys({
  collections: Joi.object().unknown(true).pattern(/.*/,
    Joi.object().unknown(false).keys({
      indexes: Joi.object().unknown(true).pattern(/.*/,
        Joi.array().min(1).items(Joi.string().min(1))
      ),
    })
  ).optional(),
  groups: Joi.object().unknown(true).pattern(/.*/,
    Joi.object().keys({
      rules: Joi.object().unknown(true).pattern(/.*/,
        Joi.object().unknown(false).keys({
          template: Joi.string(),
          validators: Joi.object().unknown(true).pattern(/.*/,
            Joi.string()
          ).optional(),
        })
      ),
    })
  ).optional(),
});

const parse_schema = (schema_toml) => {
  const parsed = Joi.validate(toml.parse(schema_toml), schema_schema);
  const schema = parsed.value;

  if (parsed.error) {
    throw parsed.error;
  }

  console.log(`raw schema: ${JSON.stringify(schema)}`);

  const collections = [ ];
  if (schema.collections) {
    for (const name in schema.collections) {
      console.log(`handling ${name}`);
      collections.push(Object.assign({ id: name }, schema.collections[name]));
    }
  }

  const groups = [ ];
  if (schema.groups) {
    for (const name in schema.groups) {
      console.log(`handling ${name}`);
      groups.push(Object.assign({ id: name }, schema.groups[name]));
    }
  }

  return { groups, collections };
};

const runCommand = (options, done) => {
  let schema;
  let conn;

  logger.remove(logger.transports.Console);
  interrupt.on_interrupt((done) => {
    if (conn) {
      conn.close();
    }
    done();
  });

  serve.change_to_project_dir(options.project);

  return new Promise((resolve) => {
    let schema_toml = '';
    options.in_file.on('data', (buffer) => (schema_toml += buffer));
    options.in_file.on('end', () => resolve(schema_toml));
  }).then((schema_toml) => {
    schema = parse_schema(schema_toml);

    console.log(JSON.stringify(schema));

    return options.start_rethinkdb &&
      start_rdb_server().then((rdbOpts) => {
        options.rdb_port = rdbOpts.driverPort;
      });
  }).then(() => {
    // Connect to the database
    return r.connect({ host: options.rdb_host,
                       port: options.rdb_port,
                       db: 'horizon_internal' });
  }).then((rdb_conn) => {
    // Wait for metadata tables to be writable
    conn = rdb_conn;
    return r.db('horizon_internal')
            .wait({ waitFor: 'ready_for_writes', timeout: 30 })
            .run(conn);
  }).then(() => {
    // Clear the metadata, if requested
    if (options.clear) {
      // TODO: warn about tables that will no longer exist after this step
      return r.expr([ r.table('collections').delete(),
                      r.table('groups').delete() ]).run(conn);
    }
  }).then(() => {
    // Write the metadata
    return r.expr([ r.table('collections').upsert(schema.collections),
                    r.table('groups').upsert(schema.groups) ])
            .run(conn);
  }).then(() => {
    // Ensure 
  }).then((res) => {
    conn.close();
    const toml_str = config_to_toml(res.collections, res.groups);
    options.out_file.write(toml_str);
  }).then(() => process.exit(0)).catch(done);
};

module.exports = {
  addArguments,
  processConfig,
  runCommand,
};
