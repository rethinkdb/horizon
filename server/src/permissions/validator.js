'use strict';

const vm = require('vm');
const check = require('../error').check;

class Validator {
  constructor(str) {
    this._fn = vm.runInNewContext(str, {});
    check(typeof this._fn === 'function');
  }

  is_valid() {
    return this._fn(...arguments);
  }
}


module.exports = { Validator };
