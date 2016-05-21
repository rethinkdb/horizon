'use strict';

const { basename, resolve } = require('path');
const fs = require('fs');

const projectNameRegex = /^[A-Za-z0-9_]+$/;

function pathExists(pathName) {
  try {
    fs.accessSync(pathName);
    return true;
  } catch (e) {
    return false;
  }
}

function checkProjectName(prospectiveName, log) {
  let correctedName = prospectiveName;
  if (pathExists(correctedName)) {
    correctedName = basename(resolve(correctedName));
  }
  correctedName = correctedName.replace(/-/g, '_');
  if (projectNameRegex.test(correctedName)) {
    return correctedName;
  } else {
    return new Error(`Invalid characters in project name: ${correctedName}. ` +
                     'The name must match /[A-Za-z0-9_]+/');
  }
}

module.exports = checkProjectName;
