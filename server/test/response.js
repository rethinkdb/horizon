'use strict';

const Response = require('../src/response');

const assert = require('assert');
const EventEmitter = require('events');
const sinon = require('sinon');

function makeResponse(sendCallback) {
  return new Response(new EventEmitter(), sendCallback);
}

function handleRejection(response) {
  return response.complete.catch(() => null);
}

describe('Response', () => {
  describe('write', () => {
    it('sends a patch', () => {
      const patch = {foo: 'patch'};
      const send = sinon.spy();
      const response = makeResponse(send);
      response.write(patch);
      assert.equal(send.callCount, 1);
      assert.deepStrictEqual(send.args[0], [{patch: [patch]}]);
    });

    it('sends an array of patches', () => {
      const patches = [{foo: 'patch'}, {bar: 'patch'}];
      const send = sinon.spy();
      const response = makeResponse(send);
      response.write(patches);
      assert.equal(send.callCount, 1);
      assert.deepStrictEqual(send.args[0], [{patch: patches}]);
    });
  });

  function endTests(endParam) {
    it('errors on "write" after "end"', () => {
      const response = makeResponse(sinon.mock());
      response.end(endParam);
      assert.throws(() => response.write(endParam),
                    /response has already completed/);
      return handleRejection(response);
    });

    it('ignores multiple "end"', () => {
      const send = sinon.spy();
      const response = makeResponse(send);
      response.end(endParam);
      response.end(endParam);
      return handleRejection(response).then(() => {
        assert.equal(send.callCount, 1);
      });
    });
  }

  function endSuccessTests(endParam) {
    it('fulfills complete promise', () => {
      const response = makeResponse(sinon.mock());
      response.end(endParam);
      return response.complete;
    });

    endTests(endParam);
  }

  describe('end success', () => {
    describe('with no patch', () => {
      it('sends final message', () => {
        const send = sinon.spy();
        const response = makeResponse(send);
        response.end();
        assert.equal(send.callCount, 1);
        assert.deepStrictEqual(send.args[0], [{complete: true}]);
      });

      endSuccessTests();
    });

    describe('with a single patch', () => {
      const patch = {foo: 'patch'};

      it('sends final message', () => {
        const send = sinon.spy();
        const response = makeResponse(send);
        response.end(patch);
        assert.equal(send.callCount, 1);
        assert.deepStrictEqual(send.args[0], [{
          complete: true,
          patch: [patch],
        }]);
      });

      endSuccessTests(patch);
    });

    describe('with an array of patches', () => {
      const patches = [{bar: 'patch'}, {baz: 'patch'}];

      it('sends final message', () => {
        const send = sinon.spy();
        const response = makeResponse(send);
        response.end(patches);
        assert.equal(send.callCount, 1);
        assert.deepStrictEqual(send.args[0], [{
          complete: true,
          patch: patches,
        }]);
      });

      endSuccessTests(patches);
    });
  });

  describe('end failure', () => {
    const error = new Error('dummy');

    it('rejects complete promise', () => {
      const response = makeResponse(sinon.mock());
      response.end(error);
      return response.complete.then(
        () => assert(false),
        (err) => assert(err.message.match(/dummy/))
      );
    });

    it('sends error message', () => {
      const send = sinon.spy();
      const response = makeResponse(send);
      response.end(error);
      return handleRejection(response).then(() => {
        assert.equal(send.callCount, 1);
        assert.deepStrictEqual(send.args[0], [{error: 'dummy', errorCode: -1}]);
      });
    });

    it('sends error message with code', () => {
      const errorWithCode = new Error('dummy');
      errorWithCode.code = 5;
      const send = sinon.spy();
      const response = makeResponse(send);
      response.end(errorWithCode);
      return handleRejection(response).then(() => {
        assert.equal(send.callCount, 1);
        assert.deepStrictEqual(send.args[0], [{error: 'dummy', errorCode: 5}]);
      });
    });

    endTests(error);
  });
});
