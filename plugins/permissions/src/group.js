'use strict';

const Rule = require('./rule');

class Group {
  constructor(rowData) {
    this.name = rowData.id;
    this.rules = Object.keys(rowData.rules).map((name) =>
      new Rule(name, rowData.rules[name]));
  }
}

module.exports = Group;
