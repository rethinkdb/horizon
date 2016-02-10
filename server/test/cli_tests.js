'use strict';

const cli = require('../src/cli');
const assert = require('assert');

const all_tests = (table) => {
  it('can read from config file', function(done) {
    const parsed = {
      config: '../test/config.example.js',
    };
    const initial_config = {};

    let config;
    try {
      config = cli.read_from_config_file(initial_config, parsed);
    } catch (err) {
      assert.ifError(err);
    }

    assert.deepEqual(config, {
      insecure: true,
      port: 5151,
      dev: true,
      auto_create_index: false,
      auto_create_table: false,
      cert_file: '/certs/cert.pem',
      connect: 'localhost:28015',
      debug: true,
      key_file: './key.pem',
    });
    done();
  });

  it('can read from environment vars', function(done) {
    // Test multiple underscores
    process.env.FUSION_KEY_FILE = './this_key.pem';
    process.env.FUSION_PORT = 2121;
    process.env.FUSION_AUTO_CREATE_INDEX = true;

    // Should ignore
    process.env._FUSION_BAD = 'wat';
    process.env.FUSION__PORT = 3131;
    process.env.FUSION__AUTO__CREATE_INDEX = false;
    process.env.FUSION_AUTO_CREATE_INDEX = false;

    let config;
    try {
      config = cli.read_from_env_vars({});
    } catch (err) {
      assert.isError(err);
    }

    assert.deepEqual(config, {
      // Inherited from defaults
      key_file: './this_key.pem',
      port: 2121,
      auto_create_index: false,
    });
    done();
  });

  it('environment vars overwrite config file vars', function(done) {
    const parsed = {
      config: '../test/config.example.js',
    };
    const initial_config = {};

    // Set init config
    let config;

    // Read from test config file
    try {
      config = cli.read_from_config_file(initial_config, parsed);
    } catch (err) {
      assert.ifError(err);
    }

    // Set env vars
    process.env.FUSION_KEY_FILE = './this_key.pem';
    process.env.FUSION_PORT = 2121;
    process.env.FUSION_CONNECT = 'fusion.rethinkdb.com:61616';
    process.env.FUSION_AUTO_CREATE_INDEX = true;
    process.env.FUSION_INSECURE = false;

    // Try reading from env vars
    try {
      config = cli.read_from_env_vars(config);
    } catch (err) {
      assert.isError(err);
    }

    assert.deepEqual(config, {
      auto_create_index: true,
      auto_create_table: false,
      cert_file: '/certs/cert.pem',
      connect: 'fusion.rethinkdb.com:61616',
      debug: true,
      dev: true,
      insecure: false,
      key_file: './this_key.pem',
      port: 2121,
    });
    done();
  });
};

const suite = (table) => describe('CLI', () => all_tests(table));

module.exports = { suite };
