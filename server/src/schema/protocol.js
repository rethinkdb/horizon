const Joi = require('joi');

const read = Joi.object({
  collection: Joi.string().token().required(),
  field_name: Joi.string().required(),

  order: Joi.string().valid('ascending', 'descending')
    .when('selection.type', {
      is: Joi.any().valid('between').optional(),
      otherwise: Joi.forbidden()
    }),

  limit: Joi.number().positive()
    .when('selection.type', {
      is: 'find_one',
      then: Joi.forbidden()
    }),

  selection: Joi.object({
      type: Joi.string().valid([
        'find',
        'find_one',
        'between'
      ]),
      args: Joi.array()
        .when('selection.type', { is: 'find_one', then: Joi.array().single() })
        .when('selection.type', { is: 'between', then: Joi.array().length(2) })
    }).optional(),

    // .options({
    //   language: {
    //     any: {
    //       unknown: 'can only be used with "between"'
    //     }
    //   }
    // })
});

const write = Joi.object({
});

const request = Joi.object({
  request_id: Joi.number(),
  type: Joi.string().valid([
    'query',
    'subscribe',

    'store',
    'remove',

    'end_subscription'
  ]),
  options: Joi.object(),
});


module.exports = { request, read, write }
