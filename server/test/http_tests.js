'use strict';

const utils = require('./utils');

const assert = require('assert');
const fs     = require('fs');
const http   = require('http');
const https  = require('https');

const suite = (table) => describe('Webserver', () => all_tests(table));

const all_tests = (table) => {
  it('localhost/fusion.js', (done) => {
      var transport = utils.is_secure() ? https : http;
      transport.get({ hostname: 'localhost',
                      port: utils.fusion_port(),
                      path: '/fusion.js',
                      rejectUnauthorized: false } , (res) => {
          const code = fs.readFileSync('../client/dist/build.js');
          var buffer = '';
          assert.strictEqual(res.statusCode, 200);
          res.on('data', (delta) => buffer += delta);
          res.on('end', () => (assert.equal(buffer, code), done()));
        });
    });
};

module.exports = { suite };
