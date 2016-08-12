const path = require('path')

const BannerPlugin = require('webpack/lib/BannerPlugin')
const DedupePlugin = require('webpack/lib/optimize/DedupePlugin')
const OccurrenceOrderPlugin = require(
  'webpack/lib/optimize/OccurrenceOrderPlugin')
const UglifyJsPlugin = require('webpack/lib/optimize/UglifyJsPlugin')
const CopyWebpackPlugin = require('copy-webpack-plugin')

const defaultOptions = {
  horizon: true,
  horizonDev: false,
  horizonCore: false,
  horizonCoreDev: false,
  tests: false,
  buildAll: false,
  production: false,
}

module.exports.default = function(options) {
  const opts = Object.assign({}, defaultOptions, options)
  const builds = []
  if (opts.horizon || opts.buildAll) {
    builds.push(horizonConfig({
      filename: 'horizon.js',
      devBuild: false,
      polyfill: true,
    }))
  }
  if (opts.horizonDev || opts.buildAll) {
    builds.push(horizonConfig({
      filename: opts.production ?
        // For convenience in dev builds
        'horizon-dev.js' : 'horizon.js',
      devBuild: true,
      polyfill: true,
    }))
  }
  if (opts.horizonCore || opts.buildAll) {
    builds.push(horizonConfig({
      filename: 'horizon-core.js',
      devBuild: false,
      polyfill: false,
    }))
  }
  if (opts.horizonCoreDev || opts.buildAll) {
    builds.push(horizonConfig({
      filename: 'horizon-core-dev.js',
      devBuild: true,
      polyfill: false,
    }))
  }
  if (opts.tests || opts.buildAll) {
    builds.push(testConfig({
      devBuild: !opts.production,
    }))
  }
  return builds
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
    devtool: 'source-maps',
    module: {
      loaders: horizonLoaders(options),
    },
    plugins: determinePlugins(options),
    node: excludeNodeLibs(options),
  }
}

function testConfig(options) {
  return {
    entry: {
      test: './test/test.js',
    },
    resolve: {
      extensions: [ '', '.ts', '.js' ],
    },
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: '[name].js',
      // Add module filenames as comments in the bundle
      pathinfo: options.devBuild,
      devtoolModuleFilenameTemplate: moduleTemplate(options),
    },
    target: 'web',
    debug: options.devBuild,
    devtool: 'source-map',
    externals: {
      // These modules are not packaged into test.js. Webpack allows
      // them to be required natively at runtime when the tests are
      // run in node
      './horizon.js': 'commonjs ./horizon.js',
      ws: 'commonjs ws',
      'source-map-support': 'commonjs source-map-support',
    },
    module: {
      noParse: [
        // Pre-built files don't need parsing
        /mocha\/mocha\.js/,
        /chai\/chai\.js/,
        /lodash\/lodash\.js/,
        /source-map-support/,
        /rxjs\/bundles\/Rx\.umd\.js/,
      ],
      loaders: horizonLoaders(options),
    },
    plugins: [
      new CopyWebpackPlugin([
        { from: './test/test.html' },
        { from: './node_modules/mocha/mocha.css' },
      ]),
    ],
    node: excludeNodeLibs(options),
  }
}

function horizonLoaders(options) {
  return [
    {
      test: /\.ts$/,
      exclude: /node_modules/,
      loader: 'ts-loader',
      query: {
        compilerOptions: {
          // Want to use es6 modules for tree-shaking in
          // webpack. tsconfig.json has it set to commonjs
          module: 'es6',
        },
      },
    }, {
      test: /\.js$/,
      exclude: /node_modules/,
      loader: 'babel-loader',
      query: {
        cacheDirectory: options.devBuild,
        // Need to keep import syntax instead of translating to
        // commonjs so webpack2 can do its tree shaking thing.  But it
        // can't be in the regular babel options in package.json
        // because the lib/ directory won't run under node until
        // import is implemented.
        presets: [ [ 'es2015', { modules: false } ] ],
      },
    },
  ]
}


function determinePlugins(options) {
  const plugins = [
    new BannerPlugin('__LICENSE__'),
  ]
  if (!options.devBuild) {
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

function excludeNodeLibs() {
  // Don't include unneeded node libs in package
  return {
    process: false,
    fs: false,
    __dirname: false,
    __filename: false,
  }
}
