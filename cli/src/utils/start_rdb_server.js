'use strict';

const each_line_in_pipe = require('./each_line_in_pipe');
const interrupt = require('./interrupt');
const horizon_server = require('@horizon/server');
const logger = horizon_server.logger;
const version_check = horizon_server.utils.rethinkdb_version_check;

const execSync = require('child_process').execSync;
const spawn = require('child_process').spawn;
const hasbinSync = require('hasbin').sync;

const defaultDb = 'horizon';
const defaultDatadir = 'rethinkdb_data';

function infoLevelLog(msg) {
  return /^Running/.test(msg) || /^Listening/.test(msg);
}

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

  // Check if `rethinkdb` in PATH
  if (!hasbinSync('rethinkdb')) {
    throw new Error('`rethinkdb` not found in $PATH, please install RethinkDB.');
  }

  // Check if RethinkDB is sufficient version for Horizon
  version_check(execSync('rethinkdb --version', { timeout: 5000 }).toString());

  const args = [ '--http-port', String(httpPort || 0),
                 '--cluster-port', '0',
                 '--driver-port', String(driverPort || 0),
                 '--cache-size', String(cacheSize),
                 '--directory', dataDir ,
                 '--no-update-check'];
  bind.forEach((host) => args.push('--bind', host));

  return new Promise((resolve, reject) => {
    const rdbProc = spawn('rethinkdb', args);

    rdbProc.once('error', (err) => {
      reject(err);
      process.exit(1);
    });
    rdbProc.once('exit', (exit_code) => {
      if (exit_code !== 0) {
        reject(new Error(`RethinkDB process terminated with error code ${exit_code}.`));
      }
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
      if (infoLevelLog(line)) {
        logger.info('RethinkDB', line);
      } else {
        logger.debug('RethinkDB stdout:', line);
      }
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
