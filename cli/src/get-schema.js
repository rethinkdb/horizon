'use strict';

const interrupt = require('./utils/interrupt');
const start_rdb_server = require('./utils/start_rdb_server');
const serve = require('./serve');
const logger = require('@horizon/server').logger;

const fs = require('fs');
const path = require('path');
const r = require('rethinkdb');

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

  parser.addArgument([ '--out-file', '-o' ],
    { type: 'string', metavar: 'PATH', defaultValue: '-',
      help: 'File to write the horizon schema to, defaults to stdout.' });
};

const processConfig = (parsed) => {
  let config, out_file;

  config = serve.make_default_config();
  config.start_rethinkdb = true;

  config = serve.merge_configs(config, serve.read_config_from_file(parsed.project_path,
                                                                   parsed.config));
  config = serve.merge_configs(config, serve.read_config_from_env());
  config = serve.merge_configs(config, serve.read_config_from_flags(parsed));

  if (parsed.out_file === '-') {
    out_file = process.stdout;
  } else {
    out_file = fs.createWriteStream(null, { fd: fs.openSync(parsed.out_file, 'w') });
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

const runCommand = (options, done) => {
  const db = options.project_name;
  const internal_db = `${db}_internal`;
  let conn;

  logger.remove(logger.transports.Console);
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
  }).then(() => process.exit(0)).catch(done);
};

module.exports = {
  addArguments,
  processConfig,
  runCommand,
};
