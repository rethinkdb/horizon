'use strict';

// Returns a new Error with the given message. Combines the stack
// traces with the old error, and removes itself from the stack trace.
module.exports = (e, newMessage) => {
  let e2;
  if (typeof newMessage === 'string') {
    e2 = new Error(newMessage);
    e2.stack = e2.stack.split('\n');
    e2.stack.splice(1, 1); // Remove rethrow from stack trace
  } else {
    e2 = newMessage;
  }
  e2.stack += '\n\n  ==== Original stack trace ====\n\n';
  e2.stack += e.stack;
  return e2;
};
