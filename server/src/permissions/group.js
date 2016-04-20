'use strict';
const Rule = require('./rule').Rule;

class Group {
  constructor(row_data) {
    this.name = row_data.id;
    this.rules = row_data.rules.map((info) => new Rule(info));
  }
}

module.exports = { Group };
