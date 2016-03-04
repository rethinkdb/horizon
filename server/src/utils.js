'use strict';

const logger = require('./logger');

const RETHINKDB_REQ_VERSION = [ 2, 2, 5 ];

// Recursive version compare, could be flatter but opted for instant return if
//  comparison is greater rather than continuing to compare to end.
const versionCompare = (given_version, req_version) => {
  // Exhausted array since all were equal, return true
  if (!given_version.length && !req_version.length) {
    return true;

  // If given is greater than required return true
  } else if (given_version[0] > req_version[0]) {
    return true;

  // Both values are equal, slice off index 0 and compare next
  } else if (given_version[0] === req_version[0]) {
    return versionCompare(given_version.slice(1), req_version.slice(1));

  // Value is less than required, return false
  } else {
    return false;
  }
};

const rethinkdb_version_check = (version_string) => {
  // Check that RethinkDB matches version requirements
  const rethinkdb_version_regex = /^rethinkdb (\d+)\.(\d+)\.(\d+)/i;
  let matches = rethinkdb_version_regex.exec(version_string);
  // Check if not null
  if (matches) {
    // Convert strings to ints and remove first match
    const versions = matches.slice(1).map((val) => parseInt(val));

    // If version good, output version else exit due to insufficient version
    if (versionCompare(versions, RETHINKDB_REQ_VERSION)) {
      logger.info(version_string);
    } else {
      logger.error(`RethinkDB (${versions.join('.')}) is below required version (${RETHINKDB_REQ_VERSION.join('.')}) for use with Horizon`);
      process.exit(1);
    }
  } else {
    logger.error(`Unable to determine RethinkDB version and continuing, check RethinkDB is >= ${RETHINKDB_REQ_VERSION.join('.')}`);
  }
};

module.exports = {
  rethinkdb_version_check,
};
