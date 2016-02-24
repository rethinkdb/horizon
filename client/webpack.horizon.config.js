const path = require('path')

const BannerPlugin = require('webpack/lib/BannerPlugin')
const DedupePlugin = require('webpack/lib/optimize/DedupePlugin')
const DefinePlugin = require('webpack/lib/DefinePlugin')
const OccurrenceOrderPlugin = require('webpack/lib/optimize/OccurrenceOrderPlugin')
const UglifyJsPlugin = require('webpack/lib/optimize/UglifyJsPlugin')

const DEV_BUILD = (process.env.NODE_ENV !== 'production')
const SOURCEMAPS = !process.env.NO_SOURCEMAPS

const argv = require('minimist')(process.argv.slice(2))
const filename = argv.filename || 'horizon.js'

module.exports = {
  entry: {
    horizon: './src/index.js',
  },
  target: 'web',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: filename,
    library: 'Horizon', // window.Horizon if loaded by a script tag
    libraryTarget: 'umd',
    pathinfo: DEV_BUILD, // Add module filenames as comments in the bundle
    devtoolModuleFilenameTemplate: DEV_BUILD ?
      function(file) {
        if (file.resourcePath.indexOf('webpack') >= 0) {
          return 'webpack:///' + file.resourcePath
        } else {
          // Show correct paths in stack traces
          return path.join('..', file.resourcePath).replace(/~/g, 'node_modules')
        }
      } :
      null,
  },
  debug: DEV_BUILD,
  devtool: SOURCEMAPS ? (DEV_BUILD ? 'source-map' : 'source-map') : false,
  module: {
    loaders: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        loader: 'babel-loader',
        query: {
          cacheDirectory: true,
          presets: [ 'babel-preset-es2015-loose' ],
          plugins: [
            'babel-plugin-transform-runtime',
            'babel-plugin-transform-function-bind',
          ],
        },
      },
    ],
  },
  plugins: [
    new BannerPlugin('__LICENSE__'),
    // Possibility to replace constants such as `if (__DEV__)`
    // and thus strip helpful warnings from production build:
    // new DefinePlugin({
    //  'process.env.NODE_ENV': (DEV_BUILD ? 'development' : 'production')
    // }),
  ].concat(DEV_BUILD ?
    [] :
    [
      new DedupePlugin(),
      new OccurrenceOrderPlugin(),
      new UglifyJsPlugin({
        compress: {
          screw_ie8: false,
          warnings: false,
        },
        mangle: {
          except: [],
        },
      }),
    ]
  ),
  node: {
    // Don't include unneeded node libs in package
    process: false,
    fs: false,
    __dirname: false,
    __filename: false,
  },
}
