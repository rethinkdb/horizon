require('core-js/shim')

if (typeof window !== 'undefined') {
  if (typeof window.Rx !== 'undefined') {
    // Insert helpful warning here
  } else {
    // In polyfill version we expose Rx, as users generally want to use the
    // same Rx as the library itself -- for example `Rx.Observable.empty()`
    window.Rx = require('rx')
  }

  if (typeof window.eio !== 'undefined') {
    // Insert helpful warning here
  } else {
    if (window.document) { // eslint-disable-line no-lonely-if
      // In polyfill version we also expose eio for now. This is mostly so that
      // we remember that eio can be omitted from the build if the user wants
      // to use only websockets.
      window.eio = require('engine.io-client/engine.io.js')
    } else {
      // This becomes `window.eio = window.eio` due to externals in webpack config,
      // so that it is not bundled to non-polyfilled version.
      window.eio = require('engine.io-client')
    }
  }
}

module.exports = require('./index')
