'use strict';

const horizon = require('../');

const assert = require('assert');
const child_process = require('child_process');
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');

const all_tests = () => {
  [ 'http', 'https' ].forEach((transport) => {
    describe(transport, () => {
      let http_server, key_file, cert_file;

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

            const cert = `${stdout.slice(cert_start, cert_end)}-----END CERTIFICATE-----\n`;
            fs.writeFile(cert_file, cert, done);
          });
      });

      after('Remove key and cert', () => {
        [ key_file, cert_file ].forEach((f) => { if (f) { fs.unlinkSync(f); } });
      });

      before('Start horizon server', (done) => {
        const four_o_four = (req, res) => {
          res.writeHeader(404);
          res.end();
        };

        if (transport === 'http') {
          http_server = new http.createServer(four_o_four);
        } else {
          http_server = new https.createServer({ key: fs.readFileSync(key_file),
                                                 cert: fs.readFileSync(cert_file) },
                                               four_o_four);
        }

        horizon(http_server, { auth: { token_secret: 'hunter2' } });

        http_server.listen(0, done);
      });

      after('Shutdown standalone horizon server', () => {
        http_server.close();
      });

      it('localhost/horizon/horizon.js', (done) => {
        require(transport).get({ host: 'localhost',
                                 port: http_server.address().port,
                                 path: '/horizon/horizon.js',
                                 rejectUnauthorized: false }, (res) => {
          const client_js = path.resolve(__dirname, '../node_modules/@horizon/client/dist/horizon.js');
          const code = fs.readFileSync(client_js);
          let buffer = '';
          assert.strictEqual(res.statusCode, 200);
          res.on('data', (delta) => { buffer += delta; });
          res.on('end', () => (assert.equal(buffer, code), done()));
        });
      });
    });
  });
};

const suite = (collection) => describe('Webserver', () => all_tests(collection));

module.exports = { suite };
