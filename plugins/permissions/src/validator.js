'use strict';

const assert = require('assert');
const vm = require('vm');

const {remakeError} = require('@horizon/plugin-utils');

class Validator {
  constructor(str) {
    try {
      this._fn = vm.runInNewContext(str, { });
    } catch (err) {
      throw remakeError(err);
    }
    assert(typeof this._fn === 'function');
  }

  isValid(...args) {
    console.log(`calling validator ${this._fn}`);
    console.log(`  with args ${JSON.stringify(args)}`);
    return this._fn(...args);
  }
}

module.exports = Validator;
