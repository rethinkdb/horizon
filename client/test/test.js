const BROWSER = (typeof window !== 'undefined')
const path = require('path')
const glob = require('../src/util/glob')

const global = glob()

if (BROWSER) {
  // Use source maps in mocha errors (ordinarily source maps
  // only work inside Developer Tools)
  require('source-map-support/browser-source-map-support.js')
  global.sourceMapSupport.install()
} else {
  // In node, require source-map-support directly. It is listed
  // as an external dependency in webpack config, so that it is
  // not bundled here.
  require('source-map-support').install()
}

if (BROWSER) {
  // Expose global.mocha and global.Mocha
  require('mocha/mocha.js')
  // Expose globals such as describe()
  global.mocha.setup('bdd')
  global.mocha.timeout(10000)
} else {
  global.WebSocket = require('ws')

  if (__dirname.split(path.sep).pop(-1) === 'test') {
    if (process.env.NODE_ENV === 'test') {
      global.Horizon = require('../src/index.js')
    } else {
      global.Horizon = require('../lib/index.js')
    }
  } else {
    global.Horizon = require('./horizon.js')
  }
}

global.chai = require('chai/chai.js')
global.chai.config.showDiff = true
global.chai.config.truncateThreshold = 0
global.expect = global.chai.expect
global.assert = global.chai.assert

// Wait until server is ready before proceeding to tests
describe('Waiting until server ready...', function() {
  this.timeout(60000)
  it('connected', done => {
    const tryConnecting = () => {
      const horizon = Horizon()
      horizon.onReady(() => {
        clearInterval(connectInterval)
        horizon.disconnect()
        done()
      })
      horizon.connect(() => {
        // Clients disconnect by themselves on failure
      })
    }
    const connectInterval = setInterval(tryConnecting, 5000)
    tryConnecting()
  })
})

// Load the suite runner
require('./api.js')

if (BROWSER) {
  mocha.run()
} else {
  // Run by mocha command
}
