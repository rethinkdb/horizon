'use strict';

const package_json = require('../package.json');

const helpText = 'Print the version number of horizon';

const runCommand = () => {
  console.info(package_json.version);
};

module.exports = {
  runCommand,
  helpText,
};
