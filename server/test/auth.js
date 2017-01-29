/* TODO: move auth out of server
'use strict';

const Auth = require('../src/auth');
const common = require('./common');

const assert = require('assert');
const jwt = require('jsonwebtoken');
const sinon = require('sinon');

const defaultGroup = 'fooGroup';
const {
  r,
  rdbConn: conn,
  makeContext: context,
  secretKey,
  usersTable,
  usersAuthTable,
} = common;

describe('Auth', () => {
  describe('constructor', () => {
    it('requires createNewUsers for allowAnonymous', () => {
      assert.throws(() => new Auth(context({auth: {createNewUsers: false}})),
                    Error);
    });
  });

  function tokenTests(getToken) {
    it('returns the same payload as the token', () =>
      getToken().then((token) => {
        const payload = jwt.decode(token.token, secretKey, {algorithms: ['HS512']});
        assert.deepStrictEqual(token.payload.id, payload.id);
        assert.deepStrictEqual(token.payload.provider, payload.provider);
      })
    );

    it('returns a valid token with the HS512 algorithm', () =>
      getToken().then((token) =>
        jwt.verify(token.token, secretKey, {algorithms: ['HS512']})
      )
    );
  }

  function generatedTokenTests(getToken, provider) {
    it('sets the token expiration time', () =>
      getToken().then((token) => {
        const payload = jwt.verify(token.token, secretKey, {algorithms: ['HS512']});
        assert(payload.exp > Date.now() / 1000);
      })
    );

    it('sets the provider', () =>
      getToken().then((token) => {
        const payload = jwt.verify(token.token, secretKey, {algorithms: ['HS512']});
        assert.strictEqual(payload.provider, provider);
      })
    );
  }

  describe('handshake', () => {
    describe('token method', () => {
      const validToken = jwt.sign({}, secretKey, {algorithm: 'HS512'});
      const makeRequest = (t) => ({options: {method: 'token', token: t}});
      const getToken = (ctx, t) => new Auth(ctx).handshake(makeRequest(t));

      it('accepts a valid token', () =>
        getToken(context(), validToken)
      );

      it('returns the original token', () =>
        getToken(context(), validToken).then((token) =>
          assert.deepStrictEqual(token.token, validToken)
        )
      );

      it('does not create a user', () => {
        const auth = new Auth(context());
        const mock = sinon.mock(auth);
        mock.expects('generate').never();
        return auth.handshake(makeRequest(validToken)).then(() => mock.verify());
      });

      it('rejects token signed with the wrong key', () => {
        const token = jwt.sign({}, 'fake', {algorithm: 'HS512'});
        return getToken(context(), token).then(
          () => assert(false),
          (err) => assert.strictEqual(err.message, 'invalid signature')
        );
      });

      it('rejects token signed with the wrong algorithm', () => {
        const token = jwt.sign({}, secretKey, {algorithm: 'HS256'});
        return getToken(context(), token).then(
          () => assert(false),
          (err) => assert.strictEqual(err.message, 'invalid algorithm')
        );
      });

      it('rejects expired token', () => {
        const token = jwt.sign({}, secretKey, {algorithm: 'HS512', expiresIn: -1000});
        return getToken(context(), token).then(
          () => assert(false),
          (err) => assert.strictEqual(err.message, 'jwt expired')
        );
      });

      tokenTests(() => getToken(context(), validToken));
      // Don't do generated token tests since it just returns the original token
    });

    describe('unauthenticated method', () => {
      const makeRequest = () => ({options: {method: 'unauthenticated'}});
      const getToken = (ctx) => new Auth(ctx).handshake(makeRequest());

      it('works', () =>
        getToken(context())
      );

      it('does not create a user', () => {
        const auth = new Auth(context());
        const mock = sinon.mock(auth);
        mock.expects('generate').never();
        return auth.handshake(makeRequest()).then(() => mock.verify());
      });

      it('rejects if disabled', () =>
        getToken(context({auth: {allowUnauthenticated: false}})).then(
          () => assert(false),
          (err) => assert(err.message.match(/not allowed/))
        )
      );

      tokenTests(() => getToken(context()));
      generatedTokenTests(() => getToken(context()), 'unauthenticated');
    });

    describe('anonymous method', () => {
      const makeRequest = () => ({options: {method: 'anonymous'}});
      const getToken = (ctx) => {
        const auth = new Auth(ctx);
        sinon.stub(auth, 'generate').returns('dummy');
        return auth.handshake(makeRequest());
      };

      it('works', () =>
        getToken(context()).then((token) =>
          assert.strictEqual(token, 'dummy')
        )
      );

      it('creates a user', () => {
        const auth = new Auth(context());
        const mock = sinon.mock(auth);
        mock.expects('generate').once().returns('dummy');
        return auth.handshake(makeRequest()).then(() => mock.verify());
      });

      it('rejects if disabled', () =>
        getToken(context({auth: {allowAnonymous: false}})).then(
          () => assert(false),
          (err) => assert(err.message.match(/not allowed/))
        )
      );

      // Don't do token tests since we've stubbed generate
    });
  });

  describe('generate', () => {
    const provider = 'unittest';
    const generate = (id) => new Auth(context()).generate(provider, id);
    const generateAndCheck = (id) =>
      generate(id).then(() => {
        const ids = [];
        return Promise.all([
          usersTable.coerceTo('array').run(conn()).then((rows) => {
            assert.strictEqual(rows.length, 1);
            ids.push(rows[0].id);
          }),
          usersAuthTable.coerceTo('array').run(conn()).then((rows) => {
            assert.strictEqual(rows.length, 1);
            ids.push(rows[0].user_id);
          }),
        ]).then(() => {
          assert.strictEqual(ids.length, 2);
          assert.deepStrictEqual(ids[0], ids[1]);
        });
      });

    before(() => common.startRethinkdb());
    after(() => common.stopRethinkdb());

    beforeEach(() => common.clearUsers()); // Clear out the admin user
    afterEach(() => common.clearUsers()); // Ensure no side-effects for other tests

    it('creates a user with a uuid', () => generateAndCheck(r.uuid()));
    it('creates a user with a literal string', () => generateAndCheck('newUser'));
    it('creates a user with a literal array', () => generateAndCheck(['foo', 'bar']));
    it('creates a user with a literal object', () => generateAndCheck({foo: 'bar'}));

    it('assigns the default user group', () =>
      generate(r.uuid()).then(() =>
        usersTable.coerceTo('array').run(conn()).then((rows) => {
          assert.strictEqual(rows.length, 1);
          assert.deepStrictEqual(rows[0].groups, ['default', defaultGroup]);
        })
      )
    );

    it('loads an existing user', () => {
      const existingUser = 'existing';
      return common.addUser('unittest', existingUser).then((id) =>
        generate(existingUser).then((token) => {
          assert.strictEqual(token.payload.id, id);
        })
      );
    });

    tokenTests(() => generate(r.uuid()));
    generatedTokenTests(() => generate(r.uuid()), provider);
  });
});
*/
