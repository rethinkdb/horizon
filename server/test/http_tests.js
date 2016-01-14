'use strict';

const utils = require('./utils');

const assert = require('assert');
const child_process = require('child_process');
const fs = require('fs');

const all_tests = () => {
  [ 'http', 'https' ].forEach((transport) => {
    describe(transport, () => {
      let port, proc, key_file, cert_file;

      before('Generate key and cert', (done) => {
        if (transport === 'http') { done(); return; }

        key_file = `key.${process.pid}.pem`;
        cert_file = `cert.${process.pid}.pem`;

        child_process.exec(
          `openssl req -x509 -nodes -batch -newkey rsa:2048 -keyout ${key_file} -days 1`,
          (err, stdout) => {
            assert.ifError(err);
            const cert_start = stdout.indexOf('-----BEGIN CERTIFICATE-----');
            const cert_end = stdout.indexOf('-----END CERTIFICATE-----');
            assert(cert_start !== -1 && cert_end !== -1);

            const cert = stdout.slice(cert_start, cert_end) + '-----END CERTIFICATE-----\n';
            fs.writeFile(cert_file, cert, done);
          });
      });

      after('Remove key and cert', () => {
        [ key_file, cert_file ].forEach((f) => { if (f) { fs.unlinkSync(f); } });
      });

      before('Start standalone fusion server', (done) => {
        let args = [ '--connect', `localhost:${utils.rdb_port()}`, '--port', '0' ];
        if (transport === 'http') {
          args.push('--insecure');
        } else {
          args.push('--key-file', key_file, '--cert-file', cert_file);
        }
        proc = child_process.fork('./src/main.js', args, { silent: true });

        // Error if we didn't get the port before the server exited
        proc.stdout.once('end', () => assert.notStrictEqual(port, undefined));

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
                                 path: '/fusion/fusion.js',
                                 rejectUnauthorized: false }, (res) => {
          const code = fs.readFileSync('./node_modules/fusion-client/dist/fusion.js');
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
