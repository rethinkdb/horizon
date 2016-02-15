'use strict';

const child_process = require('child_process');
const assert = require('assert');
const each_line_in_pipe = require('./each_line_in_pipe');

const defaultDb = 'horizon';
const defaultDatadir = 'rethinkdb_data';

// start_rdb_server
// Options:
// bind: array of ip addresses to bind to, or 'all'
// dataDir: name of rethinkdb data directory. Defaults to `rethinkdb_data`
// db: name of database to use. Defaults to 'horizon'
// driverPort: port number for rethinkdb driver connections. Autoassigned by default.
// httpPort: port number for webui. Auto-assigned by default.
// cacheSize: cacheSize to give to rethinkdb in MB. Default 200.
module.exports = (options) => {
  options = options || {};
  const bind = options.bind || [ '127.0.0.1' ];
  const dataDir = options.dataDir || defaultDatadir;
  const db = options.db || defaultDb;
  let driverPort = options.rdbPort;
  let httpPort = options.rdbHttpPort;
  let cacheSize = options.cacheSize || 200;

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

    process.on('exit', () => {
      rdbProc.kill('SIGTERM');
    });

    each_line_in_pipe(rdbProc.stdout, (line) => {
      console.info(`rethinkdb stdout: ${line}`);
      if (driverPort === undefined) {
        const matches = line.match(
            /^Listening for client driver connections on port (\d+)$/);
        if (matches !== null && matches.length === 2) {
          driverPort = parseInt(matches[1]);
        }
      }
      if (httpPort === undefined) {
        const matches = line.match(
            /^Listening for administrative HTTP connections on port (\d+)$/);
        if (matches !== null && matches.length === 2) {
          httpPort = parseInt(matches[1]);
        }
      }
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
    });

    each_line_in_pipe(rdbProc.stderr, (line) =>
                      console.info(`rethinkdb stderr: ${line}`));
  });
};
