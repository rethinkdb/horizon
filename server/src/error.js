'use strict';

const check = (pred, message) => {
  if (!pred) {
    throw new Error(message);
  }
};

const fail = (message) => check(false, message);

module.exports = { check, fail };
