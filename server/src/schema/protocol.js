const Joi = require('joi');


const query = Joi.object({
  collection: Joi.string().token().required(),
  field_name: Joi.string().default('id'), // TODO: possibly require this to be specified
  selection: Joi.object({
    type: Joi.string().required().valid([
      'find',
      'find_one',
      'between'
    ]),
    args: Joi.alternatives()
      .when('selection.type', { is: 'find_one', then: Joi.array().single() })
      .when('selection.type', { is: 'between',  then: Joi.array().length(2),
                                                otherwise: Joi.array() })
  }),
  limit: Joi
    .when('selection.type', {
      is: 'find_one',
      then: Joi.forbidden(),
      otherwise: Joi.number().positive()
    }),
  order: Joi
    .when('selection.type', {
      is: 'between',
      then: Joi.string().valid([
        'ascending',
        'descending'
      ]),
      otherwise: Joi.forbidden()
    })
    // .options({
    //   language: {
    //     any: {
    //       unknown: 'can only be used with "between"'
    //     }
    //   }
    // })
});

const request = Joi.object({
  request_id: Joi.number(),
  type: Joi.string().valid([
    'query',
    'subscribe',

    'store_error',
    'store_replace',
    'store_update',
    'remove',

    'end_subscription'
  ]),
  options: Joi.object()
});


module.exports = { request, query }
