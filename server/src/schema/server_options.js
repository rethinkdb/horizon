'use strict';

const Joi = require('joi');

const options = Joi.object({
  project_name: Joi.string().default('horizon'),
  rdb_host: Joi.string().hostname().default('localhost'),
  rdb_port: Joi.number().greater(0).less(65536).default(28015),

  path: Joi.string().default('/horizon'),

  auth: Joi.object().default({ }),

  rdb_user: Joi.string().allow(null),
  rdb_password: Joi.string().allow(null),
  rdb_timeout: Joi.number().allow(null),
}).unknown(false);

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

const method = Joi.object({
  type: Joi.valid('middleware', 'option', 'prereq', 'terminal').required(),
  handler: Joi.func().minArity(2).maxArity(3).required(),
  requires: Joi.array().single().items(Joi.string()).default([]),
}).unknown(false);

module.exports = {options, auth, method};
