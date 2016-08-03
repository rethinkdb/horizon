'use strict';

const each_line_in_pipe = require('./each_line_in_pipe');
const horizon_server = require('@horizon/server');

const execSync = require('child_process').execSync;
const spawn = require('child_process').spawn;
const hasbinSync = require('hasbin').sync;

const defaultDatadir = 'rethinkdb_data';

const infoLevelLog = (msg) => /^Running/.test(msg) || /^Listening/.test(msg);

const r = horizon_server.r;
const logger = horizon_server.logger;
const version_check = horizon_server.utils.rethinkdb_version_check;

class RethinkdbServer {
  constructor(options) {
    const quiet = Boolean(options.quiet);
    const bind = options.bind || [ '127.0.0.1' ];
    const dataDir = options.dataDir || defaultDatadir;
    const driverPort = options.rdbPort;
    const httpPort = options.rdbHttpPort;
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
                   '--directory', dataDir,
                   '--no-update-check' ];
    bind.forEach((host) => args.push('--bind', host));

    this.proc = spawn('rethinkdb', args);

    this.ready_promise = new Promise((resolve, reject) => {
      this.proc.once('error', reject);
      this.proc.once('exit', (exit_code) => {
        if (exit_code !== 0) {
          reject(new Error(`RethinkDB process terminated with error code ${exit_code}.`));
        }
      });

      process.on('exit', () => {
        if (this.proc.exitCode === null) {
          logger.error('Unclean shutdown - killing RethinkDB child process');
          this.proc.kill('SIGKILL');
        }
      });

      const maybe_resolve = () => {
        // Once we have both ports determined, callback with all settings.
        if (this.http_port !== undefined &&
            this.driver_port !== undefined) {
          resolve(this);
        }
      };

      each_line_in_pipe(this.proc.stdout, (line) => {
        if (!quiet) {
          if (infoLevelLog(line)) {
            logger.info('RethinkDB', line);
          } else {
            logger.debug('RethinkDB stdout:', line);
          }
        }
        if (this.driver_port === undefined) {
          const matches = line.match(
              /^Listening for client driver connections on port (\d+)$/);
          if (matches !== null && matches.length === 2) {
            this.driver_port = parseInt(matches[1]);
            maybe_resolve();
          }
        }
        if (this.http_port === undefined) {
          const matches = line.match(
              /^Listening for administrative HTTP connections on port (\d+)$/);
          if (matches !== null && matches.length === 2) {
            this.http_port = parseInt(matches[1]);
            maybe_resolve();
          }
        }
      });

      each_line_in_pipe(this.proc.stderr, (line) =>
                        logger.error(`rethinkdb stderr: ${line}`));
    });
  }

  ready() {
    return this.ready_promise;
  }

  // This is only used by tests - cli commands use a more generic method as
  // the database may be launched elsewhere.
  connect() {
    return r.connect({ host: 'localhost', port: this.driver_port });
  }

  close() {
    return new Promise((resolve) => {
      if (this.proc.exitCode !== null) {
        resolve();
      } else {
        this.proc.kill('SIGTERM');

        this.proc.once('exit', () => {
          resolve();
        });

        setTimeout(() => {
          this.proc.kill('SIGKILL');
          resolve();
        }, 20000).unref();
      }
    });
  }
}

// start_rdb_server
// Options:
// quiet: boolean, suppresses rethinkdb log messages
// bind: array of ip addresses to bind to, or 'all'
// dataDir: name of rethinkdb data directory. Defaults to `rethinkdb_data`
// driverPort: port number for rethinkdb driver connections. Auto-assigned by default.
// httpPort: port number for webui. Auto-assigned by default.
// cacheSize: cacheSize to give to rethinkdb in MB. Default 200.
module.exports = (options) => new RethinkdbServer(options || { }).ready();
module.exports.r = r;
