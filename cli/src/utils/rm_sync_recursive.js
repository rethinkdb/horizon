'use strict';

const fs = require('fs');
const path = require('path');

const rmdirSyncRecursive = (dir) => {
  try {
    fs.readdirSync(dir).forEach((item) => {
      const full_path = path.join(dir, item);
      if (fs.statSync(full_path).isDirectory()) {
        rmdirSyncRecursive(full_path);
      } else {
        fs.unlinkSync(full_path);
      }
    });
    fs.rmdirSync(dir);
  } catch (err) { /* Do nothing */ }
};

module.exports = rmdirSyncRecursive;
