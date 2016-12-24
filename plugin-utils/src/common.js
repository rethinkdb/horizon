'use strict';

const minRethinkdbVersion = [2, 3, 1];

// Recursive version compare, could be flatter but opted for instant return if
//  comparison is greater rather than continuing to compare to end.
function versionCompare(actual, minimum) {
  for (let i = 0; i < minimum.length; ++i) {
    if (actual[i] > minimum[i]) {
      return true;
    } else if (actual[i] < minimum[i]) {
      return false;
    }
  }
  return true;
}

// Check that RethinkDB matches version requirements
function rethinkdbVersionCheck(versionString) {
  const rethinkdbVersionRegex = /^rethinkdb (\d+)\.(\d+)\.(\d+)/i;
  const matches = rethinkdbVersionRegex.exec(versionString);

  if (matches) {
    // Convert strings to ints and remove first match
    const versions = matches.slice(1).map((val) => parseInt(val));

    if (!versionCompare(versions, minRethinkdbVersion)) {
      throw new Error(`RethinkDB (${versions.join('.')}) is below required version ` +
                      `(${minRethinkdbVersion.join('.')}) for use with Horizon.`);
    }
  } else {
    throw new Error('Unable to determine RethinkDB version, check ' +
                    `RethinkDB is >= ${minRethinkdbVersion.join('.')}.`);
  }
}

// Used when evaluating things in a different VM context - the errors
// thrown from there will not evaluate as `instanceof Error`, so we recreate them.
function remakeError(err) {
  const newErr = new Error(err.message || 'Unknown error when evaluating template.');
  newErr.stack = err.stack || newErr.stack;
  throw newErr;
}

function isObject(x) {
  return typeof x === 'object' && !Array.isArray(x) && x !== null;
}

// false if object (unless reql_type is 'time' or 'binary', or is null or array)
// recurse on arrays
// true otherwise
function isValidIndex(x) {
  if (typeof x === 'object') {
    if (Array.isArray(x)) {
      return x.every((item) => isValidIndex(item));
    }
    return x !== null && x.$reql_type$;
  }
  return true;
}

const reqlOptions = {
  timeFormat: 'raw',
  binaryFormat: 'raw',
};

module.exports = {
  rethinkdbVersionCheck,
  remakeError,
  isObject,
  isValidIndex,
  reqlOptions,
};
