'use strict';
const Rule = require('./rule').Rule;

class Group {
  constructor(row_data) {
    this.name = row_data.id;
    this.rules = Object.keys(row_data.rules).map((name) => new Rule(name, row_data.rules[name]));
  }
}

module.exports = { Group };
