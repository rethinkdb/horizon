'use strict';

const Joi = require('joi');

const handshake = Joi.object().keys({
  request_id: Joi.number().required(),
  method: Joi.only('token', 'anonymous', 'unauthenticated').required(),
  token: Joi.string().required()
    .when('method', { is: Joi.not('token').required(), then: Joi.forbidden() }),
}).unknown(false);

const read = Joi.alternatives().try(
  Joi.object().keys({
    collection: Joi.string().token().required(),
    find: Joi.object().min(1).unknown(true).required(),
  }).unknown(false),
  Joi.object().keys({
    collection: Joi.string().token().required(),

    limit: Joi.number().integer().greater(-1).optional()
      .when('find', { is: Joi.any().required(), then: Joi.forbidden() }),

    order: Joi.array().ordered(
        Joi.array().items(Joi.string()).min(1).unique().label('fields').required(),
        Joi.string().valid('ascending', 'descending').label('direction').required()).optional()
      .when('find_all', { is: Joi.array().min(2).required(), then: Joi.forbidden() }),

    above: Joi.array().ordered(
        Joi.object().length(1).unknown(true).label('value').required(),
        Joi.string().valid('open', 'closed').label('bound_type').required()).optional()
      .when('find_all', { is: Joi.array().min(2).required(), then: Joi.forbidden() }),

    below: Joi.array().ordered(
        Joi.object().length(1).unknown(true).label('value').required(),
        Joi.string().valid('open', 'closed').label('bound_type').required()).optional()
      .when('find_all', { is: Joi.array().min(2).required(), then: Joi.forbidden() }),

    find_all: Joi.array().items(Joi.object().min(1).label('item').unknown(true)).min(1).optional(),
  }).unknown(false)
);

const write_id_optional = Joi.object({
  timeout: Joi.number().integer().greater(-1).optional().default(null),
  collection: Joi.string().token().required(),
  data: Joi.array().min(1).items(Joi.object({
    id: Joi.any().optional(),
  }).unknown(true)).required(),
}).unknown(false);

const write_id_required = Joi.object({
  timeout: Joi.number().integer().greater(-1).optional().default(null),
  collection: Joi.string().token().required(),
  data: Joi.array().min(1).items(Joi.object({
    id: Joi.any().required(),
  }).unknown(true)).required(),
}).unknown(false);

const request = Joi.object({
  request_id: Joi.number().required(),
  type: Joi.string().required(),
  options: Joi.object().required()
    .when('type', { is: Joi.string().only('end_subscription'), then: Joi.forbidden() })
    .when('type', { is: Joi.string().only('keepalive'), then: Joi.forbidden() }),
}).unknown(false);

module.exports = {
  handshake,
  request,
  query: read,
  subscribe: read,
  insert: write_id_optional,
  store: write_id_optional,
  upsert: write_id_optional,
  update: write_id_required,
  replace: write_id_required,
  remove: write_id_required,
};
