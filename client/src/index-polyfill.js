require('core-js/shim')

if (typeof window !== 'undefined') {
  if (typeof window.Rx !== 'undefined') {
    // Insert helpful warning here
  } else {
    window.Rx = require('rx')
  }
}

module.exports = require('./index')
