'use strict';

module.exports = Object.assign({}, require('./common'), {
  reads: require('./reads'),
  writes: require('./writes'),
  auth: require('./auth'),
});
