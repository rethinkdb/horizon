'use strict';

const Joi = require('joi');

// Options for Server object construction
const server = Joi.object({
  project_name: Joi.string().default('horizon'),
  rdb_host: Joi.string().hostname().default('localhost'),
  rdb_port: Joi.number().greater(0).less(65536).default(28015),

  path: Joi.string().default('/horizon'),

  auth: Joi.object().default({ }),

  rdb_user: Joi.string().allow(null),
  rdb_password: Joi.string().allow(null),
  rdb_timeout: Joi.number().allow(null),
}).unknown(false);

// Options for Auth object construction
const auth = Joi.object({
  success_redirect: Joi.string().default('/'),
  failure_redirect: Joi.string().default('/'),

  duration: Joi.alternatives(Joi.string(), Joi.number().positive()).default('1d'),

  create_new_users: Joi.boolean().default(true),
  new_user_group: Joi.string().default('authenticated'),

  token_secret: Joi.string().allow(null),
  allow_anonymous: Joi.boolean().default(false),
  allow_unauthenticated: Joi.boolean().default(false),
}).unknown(false);

// Options for server.addMethod()
const method = Joi.object({
  type: Joi.valid('middleware', 'option', 'prereq', 'terminal').required(),
  handler: Joi.func().minArity(2).maxArity(3).required(),
  requires: Joi.array().single().items(Joi.string()).default([]),
}).unknown(false);

// The Horizon protocol handshake message
const handshake = Joi.object().keys({
  request_id: Joi.number().required(),
  type: Joi.only('handshake'),
  options: Joi.object().keys({
    method: Joi.only('token', 'anonymous', 'unauthenticated').required(),
    token: Joi.string().required()
      .when('method', {is: Joi.not('token').required(), then: Joi.forbidden()}),
  }),
}).unknown(false);

// Every Horizon protocol request (following the handshake)
const request = Joi.object({
  request_id: Joi.number().required(),
  type: Joi.only('endRequest', 'keepalive').optional(),
  options: Joi.object().pattern(/.*/, Joi.array()).unknown(true).required()
    .when('type', {is: Joi.string().only('endRequest', 'keepalive').required(),
                   then: Joi.forbidden()}),
}).unknown(false);

module.exports = {server, auth, method, handshake, request};
