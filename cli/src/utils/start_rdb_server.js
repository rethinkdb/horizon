'use strict';

const each_line_in_pipe = require('./each_line_in_pipe');
const horizon_server = require('@horizon/server');
const versionCheck = require('@horizon/plugin-utils').rethinkdbVersionCheck;

const EventEmitter = require('events');
const execSync = require('child_process').execSync;
const spawn = require('child_process').spawn;
const hasbinSync = require('hasbin').sync;

const r = require('rethinkdb');

const defaultDatadir = 'rethinkdb_data';

const infoLevelLog = (msg) => /^Running/.test(msg) || /^Listening/.test(msg);

class RethinkdbServer extends EventEmitter {
  constructor(options) {
    super();
    const bind = options.bind || ['127.0.0.1'];
    const dataDir = options.dataDir || defaultDatadir;
    const driverPort = options.rdbPort;
    const httpPort = options.rdbHttpPort;
    const cacheSize = options.cacheSize || 200;

    // Check if `rethinkdb` in PATH
    if (!hasbinSync('rethinkdb')) {
      throw new Error('`rethinkdb` not found in $PATH, please install RethinkDB.');
    }

    // Check if RethinkDB is sufficient version for Horizon
    versionCheck(execSync('rethinkdb --version', {timeout: 5000}).toString());

    const args = ['--output=L',
                  '--error=L',
                  'rethinkdb',
                  '--http-port', String(httpPort || 0),
                  '--cluster-port', '0',
                  '--driver-port', String(driverPort || 0),
                  '--cache-size', String(cacheSize),
                  '--directory', dataDir,
                  '--no-update-check'];
    bind.forEach((host) => args.push('--bind', host));

    this.proc = spawn('stdbuf', args);

    this.readyPromise = new Promise((resolve, reject) => {
      this.proc.once('error', reject);
      this.proc.once('exit', (exitCode) => {
        if (exitCode !== 0) {
          reject(new Error(`RethinkDB process terminated with error code ${exitCode}.`));
        }
      });

      process.on('exit', () => {
        if (this.proc.exitCode === null) {
          this.emit('log', 'error', 'Unclean shutdown - killing RethinkDB child process');
          this.proc.kill('SIGKILL');
        }
      });

      const maybeResolve = () => {
        // Once we have both ports determined, callback with all settings.
        if (this.httpPort !== undefined &&
            this.driverPort !== undefined) {
          resolve(this);
        }
      };

      each_line_in_pipe(this.proc.stdout, (line) => {
        if (infoLevelLog(line)) {
          this.emit('log', 'info', line);
        } else {
          this.emit('log', 'debug', line);
        }
        if (this.driverPort === undefined) {
          const matches = line.match(
              /^Listening for client driver connections on port (\d+)$/);
          if (matches !== null && matches.length === 2) {
            this.driverPort = parseInt(matches[1]);
            maybeResolve();
          }
        }
        if (this.httpPort === undefined) {
          const matches = line.match(
              /^Listening for administrative HTTP connections on port (\d+)$/);
          if (matches !== null && matches.length === 2) {
            this.httpPort = parseInt(matches[1]);
            maybeResolve();
          }
        }
      });

      each_line_in_pipe(this.proc.stderr, (line) =>
                        this.emit('log', 'error', line));
    });
  }

  ready() {
    return this.readyPromise;
  }

  // This is only used by tests - cli commands use a more generic method as
  // the database may be launched elsewhere.
  connect() {
    return r.connect({host: 'localhost', port: this.driverPort});
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
// bind: array of ip addresses to bind to, or 'all'
// dataDir: name of rethinkdb data directory. Defaults to `rethinkdb_data`
// driverPort: port number for rethinkdb driver connections. Auto-assigned by default.
// httpPort: port number for webui. Auto-assigned by default.
// cacheSize: cacheSize to give to rethinkdb in MB. Default 200.
module.exports = (options) => new RethinkdbServer(options || { });
module.exports.r = r;
