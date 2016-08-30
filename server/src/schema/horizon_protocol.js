'use strict';

const Joi = require('joi');

const handshake = Joi.object().keys({
  request_id: Joi.number().required(),
  method: Joi.only('token', 'anonymous', 'unauthenticated').required(),
  token: Joi.string().required()
    .when('method', {is: Joi.not('token').required(), then: Joi.forbidden()}),
}).unknown(false);
// RSI: get this working again
// const request = Joi.object({
//   request_id: Joi.number().required(),
//   type: Joi.only('end_subscription', 'keepalive').optional(),
//   options: Joi.object().pattern(/.*/, Joi.array()).unknown(true).required()
//     .when('type', {is: Joi.string().only('end_subscription', 'keepalive'), then: Joi.forbidden()})
// }).unknown(false);
// 
const request = Joi.object({
  request_id: Joi.number().required(),
  options: Joi.object().pattern(/.*/, Joi.array()).unknown(true).required(),
}).unknown(false);

module.exports = {
  handshake,
  request,
};
