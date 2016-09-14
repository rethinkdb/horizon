'use strict';

const path = require('path');
const basename = path.basename;
const join = path.join;

const fixableProjectName = /^[A-Za-z0-9_-]+$/;
const unfixableChars = /[^A-Za-z0-9_-]/g;

const dehyphenate = (name) => name.replace(/-/g, '_');

const shouldCreateDir = (prospectiveName, dirList) => {
  if (prospectiveName === '.' ||
      prospectiveName == null ||
      !fixableProjectName.test(prospectiveName)) {
    return false;
  } else if (dirList.indexOf(prospectiveName) === -1) {
    return true;
  } else {
    return false;
  }
};

module.exports = (prospectiveName, cwd, dirList) => {
  let chdirTo = prospectiveName != null ?
        join(cwd, prospectiveName) : cwd;
  const createDir = shouldCreateDir(prospectiveName, dirList);
  if (prospectiveName === '.' || prospectiveName == null) {
    // eslint-disable-next-line no-param-reassign
    prospectiveName = basename(cwd);
    chdirTo = false;
  }
  if (fixableProjectName.test(prospectiveName)) {
    return {
      dirName: prospectiveName,
      projectName: dehyphenate(prospectiveName),
      chdirTo,
      createDir,
    };
  } else {
    const invalids = prospectiveName.match(unfixableChars).join('');
    throw new Error(`Invalid characters in project name: ${invalids}`);
  }
};
