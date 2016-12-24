'use strict';

module.exports = Object.assign({}, require('./common'), {
  reads: require('./reads'),
  writes: require('./writes'),
  test: require('./test'),
  auth: require('./auth'),
});
