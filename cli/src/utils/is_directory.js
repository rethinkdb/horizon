'use strict';

const path = require('path');
const fs = require('fs');

module.exports = (dirname) => {
  try {
    return fs.statSync(path.resolve(dirname)).isDirectory();
  } catch (e) {
    return false;
  }
};
