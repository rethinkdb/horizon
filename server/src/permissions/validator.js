'use strict';

const check = require('../error').check;
const logger = require('../logger');
const remake_error = require('../utils').remake_error;

const vm = require('vm');

class Validator {
  constructor(str) {
    try {
      this._fn = vm.runInNewContext(str, {});
    } catch (err) {
      throw remake_error(err);
    }
    check(typeof this._fn === 'function');
  }

  is_valid() {
    try {
      return this._fn.apply(this._fn, arguments);
    } catch (err) {
      // We don't want to pass the error message on to the user because it might leak
      // information about the data.
      logger.error(`Exception in validator function: ${err.stack}`);
      throw new Error('Validation error');
    }
  }
}


module.exports = { Validator };
