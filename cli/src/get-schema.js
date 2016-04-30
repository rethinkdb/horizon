'use strict';

const interrupt = require('./utils/interrupt');
const start_rdb_server = require('./utils/start_rdb_server');
const serve = require('./serve');
const logger = require('@horizon/server').logger;

const fs = require('fs');
const r = require('rethinkdb');

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

  parser.addArgument([ '--out-file', '-o' ],
    { type: 'string', metavar: 'PATH', defaultValue: '-',
      help: 'File to write the horizon schema to, defaults to stdout.' });

  parser.addArgument([ '--debug' ],
    { type: 'string', metavar: 'yes|no', constant: 'yes', nargs: '?',
      help: 'Enable debug logging.' });
};

const processConfig = (parsed) => {
  let config;
  
  config = serve.make_default_config();
  config = serve.merge_configs(config, serve.read_config_from_file(parsed.config));
  config = serve.merge_configs(config, serve.read_config_from_env());
  config = serve.merge_configs(config, serve.read_config_from_flags(parsed));

  let out_file;
  if (parsed.out_file === '-') {
    out_file = process.stdout;
  } else {
    out_file = fs.createWriteStream(null, { fd: fs.openSync(parsed.out_file, 'w') });
  }

  return {
    start_rethinkdb: config.start_rethinkdb,
    rdb_host: config.rdb_host,
    rdb_port: config.rdb_port,
    project: config.project,
    debug: config.debug,
    out_file,
  };
};

const config_to_toml = (collections, groups) => {
  const res = [ '# This is a TOML document' ];

  for (const c of collections) {
    res.push('');
    res.push(`[collections.${c.id}.indexes]`);

    for (const index_name in c.indexes) {
      res.push(`${index_name} = ${JSON.stringify(c.indexes[index_name])}`);
    }
  }

  for (const g of groups) {
    res.push('');
    res.push(`[groups.${g.id}]`);
    for (const rule of g.rules) {
      res.push(`[groups.${g.id}.rules.${rule.name}]`);
      res.push(`template = ${JSON.stringify(rule.template)}`);
      res.push(`[groups.${g.id}.rules.${rule.name}.validators]`);
      for (const validator_name in rule.validators) {
        res.push(`${validator_name} = ${JSON.stringify(rule.validators[validator_name])}`);
      }
    }
  }

  res.push('');
  return res.join('\n');
};

const runCommand = (options, done) => {
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
    resolve(options.start_rethinkdb &&
            start_rdb_server().then((rdbOpts) => {
              options.rdb_port = rdbOpts.driverPort;
            }));
  }).then(() => {
    return r.connect({ host: options.rdb_host,
                       port: options.rdb_port,
                       db: 'horizon_internal' });
  }).then((rdb_conn) => {
    conn = rdb_conn;
    return r.db('horizon_internal')
            .wait({ waitFor: 'ready_for_reads', timeout: 30 })
            .run(conn);
  }).then(() => {
    return r.object('collections', r.table('collections').coerceTo('array'),
                    'groups', r.table('groups').coerceTo('array'))
            .run(conn);
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
