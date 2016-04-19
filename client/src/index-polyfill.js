// Ensures these features are present or polyfilled
// See http://kangax.github.io/compat-table/es6/
require('core-js/fn/array/from')
require('core-js/fn/array/find-index')
require('core-js/fn/array/keys')
require('core-js/fn/object/assign')

if (typeof window !== 'undefined') {
  if (typeof window.Rx !== 'undefined') {
    // Insert helpful warning here
  } else {
    // In polyfill version we expose Rx, as users generally want to use the
    // same Rx as the library itself -- for example `Rx.Observable.empty()`
    window.Rx = require('rxjs')
  }
}

module.exports = require('./index')
