'use strict';
const Rule = require('./rule').Rule;

class Group {
  constructor(row_data) {
    this.name = row_data.id;
    this.rules = [ ];
    for (const name in row_data.rules) {
      this.rules.push(new Rule(name, row_data.rules[name]));
    }
  }
}

module.exports = { Group };
