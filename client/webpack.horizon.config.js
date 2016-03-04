const path = require('path')

const BannerPlugin = require('webpack/lib/BannerPlugin')
const DedupePlugin = require('webpack/lib/optimize/DedupePlugin')
const DefinePlugin = require('webpack/lib/DefinePlugin')
const NoErrorsPlugin = require('webpack/lib/NoErrorsPlugin')
const OccurrenceOrderPlugin = require('webpack/lib/optimize/OccurrenceOrderPlugin')
const UglifyJsPlugin = require('webpack/lib/optimize/UglifyJsPlugin')

module.exports = function(buildTarget) {
 const FILENAME = buildTarget.FILENAME
 const DEV_BUILD = buildTarget.DEV_BUILD
 const POLYFILL = buildTarget.POLYFILL
 const SOURCEMAPS = !process.env.NO_SOURCEMAPS

 return {
  entry: {
    'horizon': POLYFILL ?
       './src/index-polyfill.js' :
       './src/index.js',
  },
  target: 'web',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: FILENAME,
    // Expose to window.Horizon if loaded by a script tag
    library: 'Horizon',
    libraryTarget: 'umd',
    // Add module filenames as comments in the bundle
    pathinfo: DEV_BUILD,
    // Configure source map urls visible in stack traces and "sources" panel
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
  externals: function(context, request, callback) {
    // Selected modules are not packaged into horizon.js. Webpack allows them to be
    // required natively at runtime, either from filesystem (node) or window global.

    // We import pre-bundled engine.io.js directly for now, and allow it to be
    // stripped from build if the user wants to use only websockets.
    if (!POLYFILL && request === 'engine.io-client/engine.io.js') {
      return callback(null, {
        // If loaded via script tag, has to be at window.eio when library loads
        root: 'eio',
        // Otherwise imported via `require('engine.io-client')`
        commonjs: 'engine.io-client',
        commonjs2: 'engine.io-client',
        amd: 'engine.io-client',
      })
    }

    // We require `engine.io-client` for node versions, and always omit it from
    // the build, as it is required directly from the filesystem.
    if (request === 'engine.io-client') {
      return callback(null, {
        // If loaded via script tag, has to be at window.eio when library loads
        root: 'eio',
        // Otherwise imported via `require('engine.io-client')`
        commonjs: 'engine.io-client',
        commonjs2: 'engine.io-client',
        amd: 'engine.io-client',
      })
    }

    // Rx can be provided by user via window.Rx
    if (!POLYFILL && request === 'rx') {
      return callback(null, {
        // If loaded via script tag, has to be at window.Rx when library loads
        root: 'Rx',
        // Otherwise imported via `require('rx')`
        commonjs: 'rx',
        commonjs2: 'rx',
        amd: 'rx',
      })
    }

    // Otherwise package as usual
    return callback()
  },
  debug: DEV_BUILD,
  devtool: SOURCEMAPS ? (DEV_BUILD ? 'source-map' : 'source-map') : false,
  module: {
    noParse: [
      RegExp('rx/dist/rx.all.js'),
      RegExp('engine.io-client/engine.io.js'),
    ],
    preLoaders: [
      //{ test: /\.js$/, loader: 'source-map-loader', exclude: null }
    ],
    loaders: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        loader: 'babel-loader',
        query: {
          cacheDirectory: true,
          extends: './src/.babelrc',
        },
      },
    ],
  },
  plugins: [
    new NoErrorsPlugin(),
    new BannerPlugin('__LICENSE__'),
    // Possibility to replace constants such as `if (__DEV__)`
    // and thus strip helpful warnings from production build:
    new DefinePlugin({
      'process.env.NODE_ENV': (DEV_BUILD ? 'development' : 'production'),
      'process.env.NO_EIO': JSON.stringify(Boolean(process.env.NO_EIO)),
    }),
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
}
