'use strict'

// Logging moved to its own module to avoid circular imports

let debug = false

module.exports = {
  log: (...args) => debug ? console.log(...args) : undefined,
  logError: (...args) => debug ? console.error(...args) : undefined,
  enableLogging(deb = true) { debug = deb },
}
