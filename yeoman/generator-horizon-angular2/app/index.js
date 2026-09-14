'use strict';

const chalk = require('chalk');
const yeoman = require('yeoman-generator');
const yosay = require('yosay');
module.exports = yeoman.generators.Base.extend({
  prompting: function() {
        // yeoman greeting
    this.log(yosay(
      `Yo! I\'m here to help build your 
      ${chalk.bold.yellow('Horizon Angular2')} application.`
    ));
  },
  writing: {
    app: function() {
      this.directory('', '');
    },
  },
});