const BROWSER = (typeof window !== 'undefined')

if (BROWSER) {
  // Use source maps in mocha errors (ordinarily source maps
  // only work inside Developer Tools)
  require('source-map-support/browser-source-map-support.js')
  window.sourceMapSupport.install()
} else {
  // In node, require source-map-support directly. It is listed
  // as an external dependency in webpack config, so that it is
  // not bundled here.
  require('source-map-support').install()
}

if (BROWSER) {
  // Expose window.mocha and window.Mocha
  require('mocha/mocha.js')
  // Expose globals such as describe()
  window.mocha.setup('bdd')
  window.mocha.timeout(10000)
} else {
  // Emulate window globals in node for now
  global.window = global

  // In node, polyfill WebSocket. It is listed as an external dependency
  // in webpack config, so that it is not bundled here.
  window.WebSocket = require('ws')

  // Polyfill window.location
  window.location = {
    host: 'localhost:8181',
    protocol: 'http:',
    hostname: 'localhost',
    port: 8181,
  }

  // In node, require 'dist/horizon.js' at runtime, so that
  // we test the actual packaged module. It is listed as an external
  // in webpack config, so that it is not bundled here to avoid
  // race conditions when packaging.
  window.Horizon = require('./horizon.js')
}

window.chai = require('chai/chai.js')
window.chai.config.showDiff = true
window.chai.config.truncateThreshold = 0
window.expect = window.chai.expect
window.assert = window.chai.assert

window._ = require('lodash/lodash.js')

assert.isDefined(window.Rx, 'Rx is exposed to window from horizon.js bundle')
window.Rx.config.longStackSupport = true

// Wait until server is ready before proceeding to tests
describe('Waiting until server ready...', function() {
  this.timeout(60000)
  it('connected', done => {
    const tryConnecting = () => {
      const horizon = Horizon()
      horizon.onConnected(() => {
        clearInterval(connectInterval)
        horizon.dispose()
        done()
      })
      horizon.connect(() => {
        // Clients dispose by themselves on failure
      })
    }
    const connectInterval = setInterval(tryConnecting, 1000)
    tryConnecting()
  })
})

// Load the test utilities
require('./utils')

// Testing the Horizon object
require('./horizonObject.js')

// Testing insertion/storage commands
require('./store.js')
require('./insert.js')
require('./upsert.js')
require('./update.js')
require('./replace.js')
require('./times.js')

// Test the removal commands
require('./remove.js')
require('./removeAll.js')

// Read API
require('./collection.js')
require('./find.js')
require('./findAll.js')
require('./order.js')
require('./limit.js')
require('./above.js')
require('./below.js')
require('./chaining.js')

// Subscription APIs
require('./findSub.js')
require('./findAllSub.js')
require('./aboveSub.js')
require('./belowSub.js')

// Load the suite runner
require('./api.js')

if (BROWSER) {
  mocha.run()
} else {
  // Run by mocha command
}
