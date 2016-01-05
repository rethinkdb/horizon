'use strict';

const utils = require('./utils');

const assert = require('assert');
const child_process = require('child_process');
const fs = require('fs');

const all_tests = () => {
  [ 'http', 'https' ].forEach((transport) => {
    describe(transport, () => {
      let port, proc;
      before('Start standalone fusion server', (done) => {
        let args = [ '--connect', `localhost:${utils.rdb_port()}`, '--port', '0' ];
        if (transport === 'http') {
          args.push('--unsecure');
        }
        proc = child_process.fork('./src/main.js', args, { silent: true });

        // Error if we didn't get the port before the server exited
        proc.stdout.once('end', () => assert(port !== undefined));

        let buffer = '';
        proc.stdout.on('data', (data) => {
          buffer += data.toString();

          const endline_pos = buffer.indexOf('\n');
          if (endline_pos === -1) { return; }

          const line = buffer.slice(0, endline_pos);
          buffer = buffer.slice(endline_pos + 1);

          const matches = line.match(/Listening on .*:(\d+)\.$/);
          if (matches === null || matches.length !== 2) { return; }
          port = parseInt(matches[1]);
          proc.stdout.removeAllListeners('data');
          done();
        });
      });

      after('Shutdown standalone fusion server', () => {
        if (proc) {
          proc.kill('SIGKILL');
          proc = undefined;
        }
      });

      it('localhost/fusion.js', (done) => {
        require(transport).get({ hostname: 'localhost',
                                 port,
                                 path: '/fusion.js',
                                 rejectUnauthorized: false }, (res) => {
          const code = fs.readFileSync('../client/dist/build.js');
          let buffer = '';
          assert.strictEqual(res.statusCode, 200);
          res.on('data', (delta) => buffer += delta);
          res.on('end', () => (assert.equal(buffer, code), done()));
        });
      });
    });
  });
};

const suite = (table) => describe('Webserver', () => all_tests(table));

module.exports = { suite };
