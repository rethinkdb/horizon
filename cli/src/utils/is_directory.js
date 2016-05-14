'use strict';

const path = require('path');
const fs = require('fs');

function isDirectory(dirname) {
  try {
    return fs.statSync(path.resolve(dirname)).isDirectory();
  } catch (e) {
    return false;
  }
}

module.exports = isDirectory;
