const path = require('path')

const CopyWebpackPlugin = require('copy-webpack-plugin')
const NoErrorsPlugin = require('webpack/lib/NoErrorsPlugin')

const DEV_BUILD = (process.env.NODE_ENV !== 'production')
const SOURCEMAPS = !process.env.NO_SOURCEMAPS

module.exports = {
  entry: {
    test: './test/test.js',
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    // Add module filenames as comments in the bundle
    pathinfo: DEV_BUILD,
    // Configure source map urls visible in stack traces and "sources" panel
    devtoolModuleFilenameTemplate: function(file) {
      if (file.resourcePath.indexOf('webpack') >= 0) {
        return 'webpack:///' + file.resourcePath
      } else {
        // Show correct paths in stack traces
        return path.join('..', file.resourcePath).replace(/~/g, 'node_modules')
      }
    },
  },
  target: 'web',
  debug: DEV_BUILD,
  devtool: SOURCEMAPS ? 'source-map' : false,
  externals: {
    // These modules are not packaged into test.js. Webpack allows them to be
    // required natively at runtime when the tests are run in node
    './horizon.js': 'commonjs ./horizon.js',
    ws: 'commonjs ws',
    'source-map-support': 'commonjs source-map-support',
  },
  module: {
    noParse: [
      // Pre-built files don't need parsing
      RegExp('mocha/mocha.js'),
      RegExp('chai/chai.js'),
      RegExp('lodash/lodash.js'),
      RegExp('source-map-support'),
      RegExp('rx/dist/rx.all.js'),
    ],
    loaders: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        loader: 'babel-loader',
        query: {
          cacheDirectory: true,
          presets: [
            'babel-preset-es2015-loose',
            { plugins: [
              ['babel-plugin-transform-runtime', {polyfill: false}],
              'babel-plugin-transform-function-bind',
              'babel-plugin-transform-async-to-generator', // for async await
            ]},
          ],
        },
      },
    ],
  },
  node: {
    // Don't include unneeded node libs in package
    process: false,
    fs: false,
    __dirname: false,
    __filename: false,
  },
  plugins: [
    new NoErrorsPlugin(),
    new CopyWebpackPlugin([
      { from: './test/test.html' },
      { from: './node_modules/mocha/mocha.css' },
    ]),
  ],
}
