// Ensures these features are present or polyfilled
// See http://kangax.github.io/compat-table/es6/
require('core-js/fn/array/from')
require('core-js/fn/array/find-index')
require('core-js/fn/array/keys')
require('core-js/fn/object/assign')

module.exports = require('./index')
