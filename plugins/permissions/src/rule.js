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
    return this.template.is_match(query, context);
  }

  is_valid(...args) {
    if (!this.validator) {
      return true;
    }
    return this.validator.is_valid(...args);
  }
}

module.exports = Rule;
