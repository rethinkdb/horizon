'use strict';

const package_json = require('../package.json');

const runCommand = () => {
  console.log(package_json.version);
};

module.exports = {
  runCommand,
};
