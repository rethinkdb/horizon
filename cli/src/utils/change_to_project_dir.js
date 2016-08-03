'use strict';

const is_directory = require('./is_directory');

module.exports = (project_path) => {
  if (is_directory(project_path)) {
    process.chdir(project_path);
  } else {
    throw new Error(`${project_path} is not a directory`);
  }
  if (!is_directory('.hz')) {
    const nice_path = (project_path === '.' ? 'this directory' : project_path);
    throw new Error(`${nice_path} doesn't contain an .hz directory`);
  }
};
