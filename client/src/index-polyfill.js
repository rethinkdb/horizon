// TODO: size reduction
require('core-js/shim')

if (typeof window !== 'undefined') {
  if (typeof window.Rx !== 'undefined') {
    // Insert helpful warning here
  } else {
    // TODO: size reduction
    window.Rx = require('rxjs')
  }
}

module.exports = require('./index')
