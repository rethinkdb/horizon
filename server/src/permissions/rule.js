'use strict';
const Template = require('./template').Template;
const Validator = require('./validator').Validator;

class Rule {
  constructor(name, info) {
    this._name = name;
    this._template = new Template(info.template);
    if (info.validator) {
      this._validator = new Validator(info.validator);
    }
  }

  is_match(query, context) {
    return this._template.is_match(query, context);
  }

  is_valid() {
    if (!this._validator) {
      return true;
    }
    return this._validator.is_valid.apply(this._validator, arguments);
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

  validation_required() {
    for (const rule of this._rules) {
      if (!rule._validator) {
        return false;
      }
    }

    return true;
  }

  // Check that a query passes at least one rule in a set
  // Returns the matching rule or undefined if no rules match
  // Variadic - extra arguments are passed down to the validator
  validate() {
    for (const rule of this._rules) {
      if (rule.is_valid.apply(rule, arguments)) {
        return rule;
      }
    }
  }
}

// The any_rule is used when permissions are disabled - it allows all queries
const any_rule = new Rule('permissions_disabled', { template: 'any()' });

module.exports = { Rule, Ruleset, any_rule };
