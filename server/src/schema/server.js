const Joi = require('joi');


const server = Joi.object({
  local_hosts: Joi.array()
    .items(Joi.string().hostname())
    .default([ 'localhost' ]),
  local_port: Joi.number().greater(-1).default(8181),

  rdb_host: Joi.string().hostname().default('localhost'),
  rdb_port: Joi.number().greater(0).default(28015),

  db: Joi.string().token(),
  cert: Joi.string(),
  key: Joi.binary()
})
.optionalKeys('db', 'cert', 'key');


module.exports = server;
