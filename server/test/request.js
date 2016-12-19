'use strict';

const Request = require('../src/request');
const schema = require('../src/schema');

const assert = require('assert');
const Joi = require('joi');

function makeRawRequest(params) {
  const req = Object.assign({
    requestId: 7,
    options: {foo: ['bar']},
  }, params || {});

  // Make sure we only use valid requests, Request isn't in charge of validation
  return Joi.attempt(req, schema.request);
}

describe('Request', () => {
  describe('init', () => {
    it('modifies the original request', () => {
      const rawRequest = makeRawRequest();
      const request = Request.init(rawRequest, {});
      assert.equal(rawRequest, request);
    });

    it('saves the clientContext', () => {
      const clientContext = {};
      const request = Request.init(makeRawRequest(), clientContext);
      assert.equal(request.clientContext, clientContext);
    });

    it('freezes options', () => {
      const request = Request.init(makeRawRequest(), {});
      assert.throws(() => (request.options.baz = 'stuff'),
                    /object is not extensible/);
      assert.throws(() => (request.options.foo = 'bar'),
                    /Cannot assign to read only property/);
    });
  });

  describe('constructor', () => {
    it('requires a method', () => {
      const oldRequest = Request.init(makeRawRequest(), {});
      assert.throws(() => new Request(oldRequest),
                    /method must be a string/);
      assert.throws(() => new Request(oldRequest, 5),
                    /method must be a string/);
      assert.throws(() => new Request(oldRequest, null),
                    /method must be a string/);
      assert.throws(() => new Request(oldRequest, {}),
                    /method must be a string/);
    });

    it('freezes itself', () => {
      const oldRequest = Request.init(makeRawRequest(), {});
      const request = new Request(oldRequest, 'method');
      assert.throws(() => (request.baz = 'stuff'),
                    /object is not extensible/);
      assert.throws(() => (request.clientContext = 'stuff'),
                    /Cannot assign to read only property/);
    });
  });

  describe('parameters', () => {
    it('assigns based on current method', () => {
      const value = {};
      const oldRequest = Request.init(makeRawRequest(), {});
      const request = new Request(oldRequest, 'unittest');

      request.setParameter(value);
      assert.equal(request.getParameter('unittest'), value);
    });

    it('remembers across methods', () => {
      const firstValue = {};
      const secondValue = {};
      const oldRequest = Request.init(makeRawRequest(), {});
      const request = new Request(oldRequest, 'first');

      request.setParameter(firstValue);

      const request2 = new Request(oldRequest, 'second');
      assert.equal(request2.getParameter('first'), firstValue);
      request2.setParameter(secondValue);

      const request3 = new Request(oldRequest, 'third');
      assert.equal(request3.getParameter('first'), firstValue);
      assert.equal(request3.getParameter('second'), secondValue);
    });
  });
});
