'use strict';

const Template = require('./template');
const Validator = require('./validator');

class Rule {
  constructor(info) {
    this.template = new Template(info.template);
    if (info.validator) {
      this.validator = new Validator(info.validator);
    }
  }

  isMatch(query, context) {
    return this.template.isMatch(query, context);
  }

  isValid(...args) {
    if (!this.validator) {
      return true;
    }
    return this.validator.isValid(...args);
  }
}

module.exports = Rule;
