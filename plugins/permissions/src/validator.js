'use strict';

const assert = require('assert');
const vm = require('vm');

const {remakeError} = require('@horizon/plugin-utils');

class Validator {
  constructor(str) {
    try {
      this.fn = vm.runInNewContext(str, { });
    } catch (err) {
      throw remakeError(err);
    }
    assert(typeof this.fn === 'function');
  }

  isValid(...args) {
    return this.fn(...args);
  }
}

module.exports = Validator;
