'use strict';

// Used when evaluating things in a different VM context - the errors
// thrown from there will not evaluate as `instanceof Error`, so we recreate them.
const remake_error = (err) => {
  const new_err = new Error(err.message || 'Unknown error when evaluating template.');
  new_err.stack = err.stack || new_err.stack;
  throw new_err;
};

module.exports = remake_error;
