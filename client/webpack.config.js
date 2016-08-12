const path = require('path')

const BannerPlugin = require('webpack/lib/BannerPlugin')
const DedupePlugin = require('webpack/lib/optimize/DedupePlugin')
const OccurrenceOrderPlugin = require(
  'webpack/lib/optimize/OccurrenceOrderPlugin')
const UglifyJsPlugin = require('webpack/lib/optimize/UglifyJsPlugin')

module.exports.default = function(options) {
  if (options.production) {
    return [
      horizonConfig({
        filename: 'horizon-dev.js',
        devBuild: true,
        polyfill: true,
      }),
      horizonConfig({
        filename: 'horizon.js',
        devBuild: false,
        polyfill: true,
      }),
      horizonConfig({
        filename: 'horizon-core-dev.js',
        devBuild: true,
        polyfill: false,
      }),
      horizonConfig({
        filename: 'horizon-core.js',
        devBuild: false,
        polyfill: false,
      }),
      testConfig,
    ]
  } else {
    return [
      horizonConfig({
        // same filename as prod build to simplify switching
        filename: 'horizon.js',
        devBuild: true,
        polyfill: true,
      }),
      testConfig,
    ]
  }
}

function horizonConfig(options) {
  return {
    entry: options.polyfill ?
      './src/index-polyfill.js' :
      './src/index.js',
    target: 'web',
    resolve: {
      extensions: [ '', '.ts', '.js' ],
    },
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: options.filename,
      library: 'Horizon',
      libraryTarget: 'umd',
      pathinfo: options.devBuild,
      devtoolModuleFilenameTemplate: moduleTemplate(options),
    },
    externals: [
      coreExternals(options),
      { ws: 'commonjs ws' },
    ],
    debug: options.devBuild,
    // Emit source maps
    devtool: options.sourceMaps,
    module: {
      loaders: [ {
        test: /\.ts$/,
        exclude: 'node_modules',
        loader: 'ts-loader',
      }, {
        test: /\.js$/,
        exclude: 'node_modules',
        loader: 'babel-loader',
      } ],
    },
    plugins: determinePlugins(options),
    node: {
      // Don't include unneeded node libs in package
      process: false,
      fs: false,
      __dirname: false,
      __filename: false,
    },
  }
}


function determinePlugins(options) {
  const plugins = [
    new BannerPlugin('__LICENSE__'),
  ]
  if (options.devBuild) {
    plugins.push(new DedupePlugin())
    plugins.push(new OccurrenceOrderPlugin())
    plugins.push(new UglifyJsPlugin({
      compress: {
        screw_ie8: false,
        warnings: false,
      },
      mangle: {
        except: [],
      },
    }))
  }
  return plugins
}

function coreExternals(options) {
  // Selected modules are not packaged into horizon.js. Webpack allows
  // them to be required natively at runtime, either from filesystem
  // (node) or window global.
  return function(context, request, callback) {
    if (!options.polyfill && /^rxjs\/?/.test(request)) {
      callback(null, {
        // If loaded via script tag, has to be at window.Rx when
        // library loads
        root: 'Rx',
        // Otherwise imported via `require('rx')`
        commonjs: 'rxjs',
        commonjs2: 'rxjs',
        amd: 'rxjs',
      })
    } else {
      callback()
    }
  }
}

function moduleTemplate(options) {
  if (options.devBuild) {
    return function(file) {
      if (file.resourcePath.indexOf('webpack') >= 0) {
        return `webpack:///${file.resourcePath}`
      } else {
        // Show correct paths in stack traces
        return path.join('..', file.resourcePath)
          .replace(/~/g, 'node_modules')
      }
    }
  } else {
    return null
  }
}

function testConfig(options) {
  // TODO: adding things here
}
