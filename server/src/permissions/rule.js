'use strict';
const Template = require('./template').Template;
const Validator = require('./validator').Validator;

class Rule {
  constructor(info) {
    this._template = new Template(info.template);
    this._validators = new Map();
    if (info.validators) {
      for (const type in info.validators) {
        this._validators.set(type, new Validator(info.validators[type]));
      }
    }
  }

  is_match(query, context) {
    return this._template.is_match(query, context);
  }

  // The query is considered valid if it passes all validators for a matching template.
  // Variadic - passes all arguments down to the validators.
  is_valid() {
    for (const pair of this._validators) {
      const validator = pair[1];
      if (!validator.is_valid(...arguments)) {
        return false;
      }
    }
    return true;
  }
}

class Ruleset {
  constructor() {
    this.clear();
  }

  clear() {
    this._rules = [ ];
  }

  empty() {
    return this._rules.length === 0;
  }

  update(rules) {
    this._rules = rules;
  }

  // Check that a query passes at least one rule in a set
  // Returns the matching rule or undefined if no rules match
  // Variadic - extra arguments are passed down to the validators
  validate() {
    for (const rule of this._rules) {
      if (rule.is_valid(...arguments)) {
        return rule;
      }
    }
  }
}

module.exports = { Rule, Ruleset };
