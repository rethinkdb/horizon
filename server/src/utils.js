'use strict';

const MIN_VERSION = [ 2, 3, 1 ];

// Recursive version compare, could be flatter but opted for instant return if
//  comparison is greater rather than continuing to compare to end.
const version_compare = (actual, minimum) => {
  for (let i = 0; i < minimum.length; ++i) {
    if (actual[i] > minimum[i]) {
      return true;
    } else if (actual[i] < minimum[i]) {
      return false;
    }
  }
  return true;
};

// Check that RethinkDB matches version requirements
const rethinkdb_version_check = (version_string) => {
  const rethinkdb_version_regex = /^rethinkdb (\d+)\.(\d+)\.(\d+)/i;
  const matches = rethinkdb_version_regex.exec(version_string);

  if (matches) {
    // Convert strings to ints and remove first match
    const versions = matches.slice(1).map((val) => parseInt(val));

    if (!version_compare(versions, MIN_VERSION)) {
      throw new Error(`RethinkDB (${versions.join('.')}) is below required version ` +
                      `(${MIN_VERSION.join('.')}) for use with Horizon.`);
    }
  } else {
    throw new Error('Unable to determine RethinkDB version, check ' +
                    `RethinkDB is >= ${MIN_VERSION.join('.')}.`);
  }
};

// Used when evaluating things in a different VM context - the errors
// thrown from there will not evaluate as `instanceof Error`, so we recreate them.
const remake_error = (err) => {
  const new_err = new Error(err.message || 'Unknown error when evaluating template.');
  new_err.stack = err.stack || new_err.stack;
  throw new_err;
};

module.exports = {
  rethinkdb_version_check,
  remake_error,
};
