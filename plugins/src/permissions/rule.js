'use strict';
const Template = require('./template').Template;
const Validator = require('./validator').Validator;

class Rule {
  constructor(info) {
    this.template = new Template(info.template);
    if (info.validator) {
      this.validator = new Validator(info.validator);
    }
  }

  is_match(query, context) {
    return this._template.is_match(query, context);
  }

  is_valid(...args) {
    if (!this._validator) {
      return true;
    }
    return this._validator.is_valid(...args);
  }
}

module.exports = Rule;
