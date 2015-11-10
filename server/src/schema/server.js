const Joi = require('joi');

const unsecure_server_options = Joi.object({
  local_hosts: Joi.array()
    .items(Joi.string().hostname())
    .default([ 'localhost' ]),
  local_port: Joi.number().greater(-1).less(65536).default(8181),

  rdb_host: Joi.string().hostname().default('localhost'),
  rdb_port: Joi.number().greater(0).default(28015),

  db: Joi.string().token().default('fusion'),
});

const secure_server_options = unsecure_server_options.keys({
  cert: Joi.binary(),
  key: Joi.binary(),
});

module.exports = { unsecure_server_options, secure_server_options };
