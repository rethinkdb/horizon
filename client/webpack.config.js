const BUILD_ALL = (process.env.NODE_ENV === 'production')

const build = require('./webpack.horizon.config.js')
const test = require('./webpack.test.config.js')

if (BUILD_ALL) {
  module.exports = [
    build({
      FILENAME: 'horizon-dev.js',
      DEV_BUILD: true,
      POLYFILL: true,
    }),
    build({
      FILENAME: 'horizon.js',
      DEV_BUILD: false,
      POLYFILL: true,
    }),
    build({
      FILENAME: 'horizon-core-dev.js',
      DEV_BUILD: true,
      POLYFILL: false,
    }),
    build({
      FILENAME: 'horizon-core.js',
      DEV_BUILD: false,
      POLYFILL: false,
    }),
    test,
  ]
} else {
  module.exports = [
    build({
      // same filename as prod build to simplify switching
      FILENAME: 'horizon.js',
      DEV_BUILD: true,
      POLYFILL: true,
    }),
    test,
  ]
}
