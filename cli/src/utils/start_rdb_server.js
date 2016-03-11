'use strict';

const each_line_in_pipe = require('./each_line_in_pipe');
const interrupt = require('./interrupt');
const logger = require('@horizon/server').logger;

const child_process = require('child_process');

const defaultDb = 'horizon';
const defaultDatadir = 'rethinkdb_data';

// start_rdb_server
// Options:
// bind: array of ip addresses to bind to, or 'all'
// dataDir: name of rethinkdb data directory. Defaults to `rethinkdb_data`
// db: name of database to use. Defaults to 'horizon'
// driverPort: port number for rethinkdb driver connections. Auto-assigned by default.
// httpPort: port number for webui. Auto-assigned by default.
// cacheSize: cacheSize to give to rethinkdb in MB. Default 200.
module.exports = (raw_options) => {
  const options = raw_options || {};
  const bind = options.bind || [ '127.0.0.1' ];
  const dataDir = options.dataDir || defaultDatadir;
  const db = options.db || defaultDb;
  let driverPort = options.rdbPort;
  let httpPort = options.rdbHttpPort;
  const cacheSize = options.cacheSize || 200;

  const args = [ '--http-port', String(httpPort || 0),
                 '--cluster-port', '0',
                 '--driver-port', String(driverPort || 0),
                 '--cache-size', String(cacheSize),
                 '--directory', dataDir ];
  bind.forEach((host) => args.push('--bind', host));

  return new Promise((resolve, reject) => {
    const rdbProc = child_process.spawn('rethinkdb', args);

    rdbProc.once('error', (err) => {
      reject(err);
      process.exit(1);
    });

    interrupt.on_interrupt((done) => {
      if (rdbProc.exitCode === null) {
        let finished = false;
        rdbProc.kill('SIGTERM');

        rdbProc.once('exit', () => {
          if (!finished) {
            finished = true;
            done();
          }
        });

        setTimeout(() => {
          if (!finished) {
            finished = true;
            done();
          }
        }, 20000).unref();
      }
    });

    process.on('exit', () => {
      if (rdbProc.exitCode === null) {
        logger.error('Unclean shutdown - killing RethinkDB child process');
        rdbProc.kill('SIGKILL');
      }
    });

    const maybe_resolve = () => {
      if (httpPort !== undefined && driverPort !== undefined) {
        // Once we have both ports determined, callback with all
        // settings.
        resolve({
          dataDir,
          db,
          driverPort,
          httpPort,
          bind,
        });
      }
    };

    each_line_in_pipe(rdbProc.stdout, (line) => {
      logger.info(`rethinkdb stdout: ${line}`);
      if (driverPort === undefined) {
        const matches = line.match(
            /^Listening for client driver connections on port (\d+)$/);
        if (matches !== null && matches.length === 2) {
          driverPort = parseInt(matches[1]);
          maybe_resolve();
        }
      }
      if (httpPort === undefined) {
        const matches = line.match(
            /^Listening for administrative HTTP connections on port (\d+)$/);
        if (matches !== null && matches.length === 2) {
          httpPort = parseInt(matches[1]);
          maybe_resolve();
        }
      }
    });

    each_line_in_pipe(rdbProc.stderr, (line) =>
                      logger.error(`rethinkdb stderr: ${line}`));
  });
};
