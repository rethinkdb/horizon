'use strict';

const Joi = require('joi');

const max_port = 65536;

const unsecure = Joi.object({
  local_hosts: Joi.array()
    .items(Joi.string().hostname())
    .default([ 'localhost' ]),
  local_port: Joi.number().greater(-1).less(max_port).default(8181),

  rdb_host: Joi.string().hostname().default('localhost'),
  rdb_port: Joi.number().greater(0).less(max_port).default(28015),

  dev_mode: Joi.boolean().default(false),

  db: Joi.string().token().default('fusion'),
}).unknown(false);

const secure = unsecure.keys({
  cert: Joi.binary().required(),
  key: Joi.binary().required(),
});

module.exports = { unsecure, secure };
