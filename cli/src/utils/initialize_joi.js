'use strict';

// Issues a dummy joi validation to force joi to initialize its scripts.
// This is used because tests will mock the filesystem, and the lazy
// `require`s done by joi will no longer work at that point.
module.exports = (joi) =>
  joi.validate('', joi.any().when('', { is: '', then: joi.any() }));
