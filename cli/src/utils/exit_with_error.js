'use strict';

function exitWithError(message) {
  console.error(message);
  process.exit(1);
}

module.exports = exitWithError;
