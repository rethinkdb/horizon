'use strict';

const Joi = require('joi');

const read = Joi.object({
  collection: Joi.string().token().required(),
  field_name: Joi.string().required(),

  order: Joi.string().valid('ascending', 'descending')
    .when('selection.type', {
      is: Joi.any().valid('between').optional(),
      otherwise: Joi.forbidden(),
    }),

  limit: Joi.number().positive()
    .when('selection.type', {
      is: 'find_one',
      then: Joi.forbidden(),
    }),

  selection: Joi.object({
    type: Joi.string().valid([
      'find',
      'find_one',
      'between',
    ]),
    args: Joi.alternatives()
      .when('type', { is: 'find_one', then: Joi.array().length(1) })
      .when('type', { is: 'between', then: Joi.array().length(2) })
      .when('type', { is: 'find', then: Joi.array().min(1) }),
  }).unknown(false).optional(),

    // .options({
    //   language: {
    //     any: {
    //       unknown: 'can only be used with "between"'
    //     }
    //   }
    // })
}).unknown(false);

const write_id_optional = Joi.object({
  collection: Joi.string().token().required(),
  data: Joi.array().min(1).items(Joi.object({
      id: Joi.any().optional(),
    }).unknown(true)).required(),
}).unknown(false);

const write_id_required = Joi.object({
  collection: Joi.string().token().required(),
  data: Joi.array().min(1).items(Joi.object({
      id: Joi.any().required(),
    }).unknown(true)).required(),
}).unknown(false);

const request = Joi.object({
  request_id: Joi.number().required(),
  type: Joi.string().required(),
  options: Joi.object().required(),
}).unknown(false);

module.exports = {
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
