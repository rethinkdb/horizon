'use strict';

const Joi = require('joi');

const max_port = 65536;

const options = Joi.object({
  rdb_host: Joi.string().hostname().default('localhost'),
  rdb_port: Joi.number().greater(0).less(max_port).default(28015),

  auto_create_table: Joi.boolean().default(false),
  auto_create_index: Joi.boolean().default(false),

  path: Joi.string().default('/fusion'),

  db: Joi.string().token().default('fusion'),
}).unknown(false);

module.exports = options;
