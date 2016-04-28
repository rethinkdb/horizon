'use strict';

const package_json = require('../package.json');

const runCommand = () => {
  console.info(package_json.version);
};

module.exports = {
  runCommand,
};
