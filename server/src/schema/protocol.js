const Joi = require('joi');

const read = Joi.object({
  collection: Joi.string().token().required(),
  field_name: Joi.string().required(),

  // TODO: 'order' should be valid when selection is unspecified, or selection.type is 'between'
  order: Joi.string().valid('ascending', 'descending').optional(),

  // TODO: 'limit' should be valid when selection is unspecified, or selection.type is 'between' or 'find'
  limit: Joi.number().positive().optional(),

  selection: Joi.object({
    type: Joi.string().valid([
      'find',
      'find_one',
      'between'
    ]),
    args: Joi.alternatives()
      .when('selection.type', { is: 'find', then: Joi.array().length(1) })
      .when('selection.type', { is: 'between', then: Joi.array().length(2),
                                otherwise: Joi.array() })
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
