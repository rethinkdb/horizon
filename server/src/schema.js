'use strict';

const Joi = require('joi');

// Options for Server object construction
const server = Joi.object({
  path: Joi.string().regex(/[\/].*/).default('/horizon'),

  projectName: Joi.string().default('horizon'),

  rdbHost: Joi.string().hostname().default('localhost'),
  rdbPort: Joi.number().greater(0).less(65536).default(28015),
  rdbUser: Joi.string().allow(null),
  rdbPassword: Joi.string().allow(null),
  rdbTimeout: Joi.number().allow(null),

  auth: Joi.object().default({}),
}).unknown(false);

// Options for Auth object construction
const auth = Joi.object({
  tokenSecret: Joi.string().allow(null),

  successRedirect: Joi.string().default('/'),
  failureRedirect: Joi.string().default('/'),

  duration: Joi.alternatives(Joi.string(), Joi.number().positive()).default('1d'),

  createNewUsers: Joi.boolean().default(true),
  newUserGroup: Joi.string().default('authenticated'),

  allowAnonymous: Joi.boolean().default(false)
    .when('createNewUsers', {is: false, then: Joi.only(false).optional()}),
  allowUnauthenticated: Joi.boolean().default(false),
}).unknown(false);

// Options for server.addMethod()
const method = Joi.object({
  type: Joi.valid('middleware', 'option', 'prereq', 'terminal').required(),
  handler: Joi.func().minArity(2).maxArity(3).required(),
  requires: Joi.array().single().items(Joi.string()).default([]),
}).unknown(false);

// The Horizon protocol handshake message
const handshake = Joi.object().keys({
  requestId: Joi.number().required(),
  type: Joi.only('handshake').required(),
  options: Joi.object().keys({
    method: Joi.only('token', 'anonymous', 'unauthenticated').required(),
    token: Joi.string().required()
      .when('method', {is: Joi.not('token').required(), then: Joi.forbidden()}),
  }).required(),
}).unknown(false);

// Every Horizon protocol request (following the handshake)
const request = Joi.object({
  requestId: Joi.number().required(),
  type: Joi.only('endRequest', 'keepalive').optional(),
  options: Joi.object().pattern(/.*/, Joi.array()).unknown(true).required()
    .when('type', {is: Joi.string().only('endRequest', 'keepalive').required(),
                   then: Joi.forbidden()}),
}).unknown(false);

module.exports = {server, auth, method, handshake, request};
