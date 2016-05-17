'use strict';

const check = require('../error').check;
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
      throw remake_error(err);
    }
  }
}


module.exports = { Validator };
