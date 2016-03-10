'use strict';

const logger = require('./logger');

const RETHINKDB_REQ_VERSION = [ 2, 2, 5 ];

// Recursive version compare, could be flatter but opted for instant return if
//  comparison is greater rather than continuing to compare to end.
const versionCompare = (given_version, req_version) => {
  for (let i = 0; i < req_version.length; ++i) {
    if (given_version[i] > req_version[i]) {
      return true;
    } else if (given_version[i] < req_version[i]) {
      return false;
    }
  }
  return true;
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
      return true;
    } else {
      logger.error(`RethinkDB (${versions.join('.')}) is below required version (${RETHINKDB_REQ_VERSION.join('.')}) for use with Horizon`);
      return false;
    }
  } else {
    logger.error(`Unable to determine RethinkDB version, check RethinkDB is >= ${RETHINKDB_REQ_VERSION.join('.')}`);
    return false;
  }
};

module.exports = {
  rethinkdb_version_check,
};
