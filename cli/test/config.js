'use strict';

const serve = require('../src/serve');
const processConfig = serve.processConfig;

const assert = require('assert');

const mockFs = require('mock-fs');

const make_flags = (flags) => Object.assign({}, serve.parseArguments([]), flags);

const write_config = (config) => {
  let data = '';
  const recursive_add = (obj, path) => {
    const value_keys = [ ];
    const object_keys = [ ];
    for (const key in obj) {
      const val = obj[key];
      if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
        object_keys.push(key);
      } else {
        value_keys.push(key);
      }
    }

    if (value_keys.length > 0) {
      if (path) {
        data += `[${path}]\n`;
      }
      value_keys.forEach((key) => {
        data += `${key} = ${JSON.stringify(obj[key])}\n`;
      });
    }

    object_keys.forEach((key) => {
      recursive_add(obj[key], `${path}${path ? '.' : ''}${key}`);
    });
  };

  recursive_add(config, '');
  mockFs({ '.hz': { 'config.toml': data } });
};

describe('Config', () => {
  let original_env;

  before('Save env', () => {
    original_env = Object.assign({}, process.env);
  });

  beforeEach('Create empty config file', () => {
    write_config({ });
  });

  after('Restore fs', () => {
    mockFs.restore();
  });

  afterEach('Restore env', () => {
    process.env = Object.assign({}, original_env);
  });

  it('precedence', () => {
    // Test a yes/no flag (in this case `secure`)
    // Make a list of all possible states to test, each item contains
    // the state of the config file, the env, and the flags
    const states = [ ];
    const values = [ 'yes', 'no', 'false', 'true', false, true, null ];

    for (let i = 0; i < Math.pow(values.length, 3); ++i) {
      states.push([ values[i % 3], values[Math.floor(i / 3) % 3], values[Math.floor(i / 9) % 3] ]);
    }

    states.forEach((state) => {
      const parsed = { };
      let expected = true; // default value

      if (state[0] !== null) {
        write_config({ secure: state[0] });
        expected = state[0];
      } else {
        write_config({ });
      }

      if (state[1] !== null) {
        process.env.HZ_INSECURE = `${state[1]}`;
        expected = state[1];
      } else {
        delete process.env.HZ_INSECURE;
      }

      if (state[2] !== null) {
        parsed.secure = state[2];
        expected = state[2];
      }

      expected = (expected === 'yes' || expected === 'true') || expected;
      expected = (expected === 'no' || expected === 'false') ? false : expected;

      assert.strictEqual(processConfig(make_flags(parsed)).secure, expected);
    });
  });

  // An unrecognized parameter in a config file should cause an error
  it('unknown field in file', () => {
    write_config({ fake_field: 'foo' });
    assert.throws(() => processConfig(make_flags({ })),
                  /Unknown config parameter: "fake_field"./);
  });

  // An unrecognized environment variable that matches the pattern should be ignored
  it('unknown field in env', () => {
    process.env.HZ_FAKE_FIELD = 'foo';
    const config = processConfig(make_flags({ }));
    assert.strictEqual(config.fake_field, undefined);
  });

  // The port parameter should always be stored as a number
  describe('connect', () => {
    it('valid in file', () => {
      write_config({ connect: 'localhost:123' });
      const config = processConfig(make_flags({ }));
      assert.strictEqual(config.rdb_port, 123);
    });

    it('valid in env', () => {
      process.env.HZ_CONNECT = 'localhost:456';
      const config = processConfig(make_flags({ }));
      assert.strictEqual(config.rdb_port, 456);
    });

    // Make sure an error is thrown if the format is wrong
    it('invalid format in file', () => {
      write_config({ connect: 'local:host:111' });
      assert.throws(() => processConfig(make_flags({ })),
                    /Expected --connect HOST:PORT, but found "local:host:111"./);
    });

    it('invalid format in env', () => {
      process.env.HZ_CONNECT = 'local:host:111';
      assert.throws(() => processConfig(make_flags({ })),
                    /Expected --connect HOST:PORT, but found "local:host:111"./);
    });

    it('invalid format in flags', () => {
      assert.throws(() => processConfig(make_flags({ connect: 'local:host:111' })),
                    /Expected --connect HOST:PORT, but found "local:host:111"./);
    });

    // Make sure an error is thrown if the port cannot be parsed
    it('invalid port in file', () => {
      write_config({ connect: 'localhost:cat' });
      assert.throws(() => processConfig(make_flags({ })),
                    /Invalid port: "cat"./);
    });

    it('invalid port in env', () => {
      process.env.HZ_CONNECT = 'localhost:dog';
      assert.throws(() => processConfig(make_flags({ })),
                    /Invalid port: "dog"./);
    });

    it('invalid port in flags', () => {
      assert.throws(() => processConfig(make_flags({ connect: 'localhost:otter' })),
                    /Invalid port: "otter"./);
    });

    it('with start_rethinkdb in file', () => {
      write_config({ connect: 'localhost:123', start_rethinkdb: true });
      assert.throws(() => processConfig(make_flags({ })),
                    /Cannot provide both --start-rethinkdb and --connect./);
    });

    it('with start_rethinkdb in env', () => {
      process.env.HZ_CONNECT = 'localhost:123';
      process.env.HZ_START_RETHINKDB = 'true';
      assert.throws(() => processConfig(make_flags({ })),
                    /Cannot provide both --start-rethinkdb and --connect./);
    });

    it('with start_rethinkdb in flags', () => {
      assert.throws(() => processConfig(make_flags({ connect: 'localhost:123',
                                                     start_rethinkdb: true })),
                    /Cannot provide both --start-rethinkdb and --connect./);
    });

    it('with enabling and disabling start_rethinkdb', () => {
      write_config({ start_rethinkdb: true });
      process.env.HZ_CONNECT = 'example:123';
      const config = processConfig(make_flags({ start_rethinkdb: false }));

      assert.strictEqual(config.start_rethinkdb, false);
      assert.strictEqual(config.rdb_host, 'example');
      assert.strictEqual(config.rdb_port, 123);
    });

    it('with start_rethinkdb across configs', () => {
      let config;

      write_config({ connect: 'example:123' });
      config = processConfig(
        make_flags({ start_rethinkdb: true }));
      assert.strictEqual(config.start_rethinkdb, true);

      write_config({ start_rethinkdb: true });
      config = processConfig(
        make_flags({ connect: 'example:123' }));
      assert.strictEqual(config.start_rethinkdb, false);
      assert.strictEqual(config.rdb_host, 'example');
      assert.strictEqual(config.rdb_port, 123);
    });

    it('with dev mode and start_rethinkdb across configs', () => {
      let config;

      write_config({ connect: 'example:123' });
      config = processConfig(make_flags({ dev: true }));
      assert.strictEqual(config.start_rethinkdb, false);
      assert.strictEqual(config.rdb_host, 'example');
      assert.strictEqual(config.rdb_port, 123);

      write_config({ connect: 'example:123' });
      config = processConfig(
        make_flags({ start_rethinkdb: false, dev: true }));
      assert.strictEqual(config.start_rethinkdb, false);
      assert.strictEqual(config.rdb_host, 'example');
      assert.strictEqual(config.rdb_port, 123);

      write_config({ connect: 'example:123' });
      config = processConfig(
        make_flags({ start_rethinkdb: true, dev: true }));
      assert.strictEqual(config.start_rethinkdb, true);

      write_config({ start_rethinkdb: true });
      config = processConfig(make_flags({ dev: true }));
      assert.strictEqual(config.start_rethinkdb, true);

      write_config({ start_rethinkdb: true });
      config = processConfig(
        make_flags({ connect: 'example:123', dev: true }));
      assert.strictEqual(config.start_rethinkdb, false);
      assert.strictEqual(config.rdb_host, 'example');
      assert.strictEqual(config.rdb_port, 123);
    });
  });

  // The bind parameter must be stored as an array of hostnames
  describe('bind', () => {
    it('in file', () => {
      write_config({ bind: [ 'foo', 'bar' ] });
      const config = processConfig(make_flags({ }));
      assert.deepStrictEqual(config.bind, [ 'foo', 'bar' ]);
    });

    it('in env', () => {
      process.env.HZ_BIND = 'foo,bar';
      const config = processConfig(make_flags({ }));
      assert.deepStrictEqual(config.bind, [ 'foo', 'bar' ]);
    });

    it('in flags', () => {
      const config = processConfig(make_flags({ bind: [ 'foo', 'bar' ] }));
      assert.deepStrictEqual(config.bind, [ 'foo', 'bar' ]);
    });
  });

  // Auth parameters are handled slightly differently to other parameters
  // They add to an object, rather than having an explicit option name
  // for each auth provider.
  it('auth', () => {
    // provider 'foo' and 'far' through config file
    write_config({ auth: {
      foo: { id: 'foo_id', secret: 'foo_secret' },
      far: { id: 'far_id', secret: 'far_secret' },
    } });

    // provider 'bar' and 'baz' through env
    process.env.HZ_AUTH_BAR_ID = 'bar_id';
    process.env.HZ_AUTH_BAR_SECRET = 'bar_secret';
    process.env.HZ_AUTH_BAZ_ID = 'baz_id';
    process.env.HZ_AUTH_BAZ_SECRET = 'baz_secret';

    // overwrite 'far' through env
    process.env.HZ_AUTH_FAR_ID = 'far_id_new';
    process.env.HZ_AUTH_FAR_SECRET = 'far_secret_new';

    // provider 'bamf' through command-line
    // overwrite 'baz' through command-line
    const config = processConfig(make_flags({
      auth: [ 'bamf,bamf_id,bamf_secret',
              'baz,baz_id_new,baz_secret_new' ] }));

    assert.deepStrictEqual(config.auth, {
      foo: { id: 'foo_id', secret: 'foo_secret' },
      far: { id: 'far_id_new', secret: 'far_secret_new' },
      bar: { id: 'bar_id', secret: 'bar_secret' },
      baz: { id: 'baz_id_new', secret: 'baz_secret_new' },
      bamf: { id: 'bamf_id', secret: 'bamf_secret' },
    });
  });
});
