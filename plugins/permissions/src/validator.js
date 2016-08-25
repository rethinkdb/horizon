'use strict';

const remake_error = require('./remake_error');

const assert = require('assert');
const vm = require('vm');

class Validator {
  constructor(str) {
    try {
      this._fn = vm.runInNewContext(str, { });
    } catch (err) {
      throw remake_error(err);
    }
    assert(typeof this._fn === 'function');
  }

  is_valid(...args) {
    return this._fn(...args);
  }
}

module.exports = Validator;
