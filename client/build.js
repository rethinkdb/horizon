#!/bin/sh
':' //; exec "$(command -v nodejs || command -v node)" "$0" "$@"
'use strict'

let fs = require('fs')
let browserify = require('browserify')
let watchify = require('watchify')
let exorcist = require('exorcist')

const BUILD_DIR = 'dist'

function compile(watching) {
  if (!fs.existsSync(BUILD_DIR)) {
    console.log(`Creating ./${BUILD_DIR}`)
    fs.mkdirSync(BUILD_DIR)
  }
  console.log('Building dist/fusion.js and dist/fusion.js.map')
  let bundler = browserify({
    cache: {},
    packageCache: {},
    plugin: [ watchify ],
    debug: true,
  }).require('./src/index.js', { expose: 'Fusion' })
    .transform('babelify', {
    // All source files need to be babelified first
      sourceMapRelative: '.', // source maps will be relative to this dir
    })

  if (watching) {
    bundler.on('update', function() {
      console.log('-> bundling...')
      rebundle(bundler)
    })
    bundler.on('log', msg => {
      console.log(msg)
      console.log('Watching for changes...')
    })
  } else {
    bundler.on('log', msg => {
      console.log(msg)
      process.exit(0)
    })
  }

  rebundle(bundler)
}

function rebundle(bundler) {
  bundler.bundle()
    .on('error', function(err) {
      console.error(err)
      bundler.emit('end')
    })
    // exorcist splits out map to a separate file
    .pipe(exorcist(`${BUILD_DIR}/fusion.js.map`))
    // The unmapped remainder is the code itself
    .pipe(fs.createWriteStream(`${BUILD_DIR}/fusion.js`), 'utf8')
}

function help() {
  console.log(`node build.js [build | watch | help]`)
  console.log(`  build (default) -- build client and exit`)
  console.log(`  watch           -- build and watch for changes`)
  console.log(`  help            -- output this help message`)
  process.exit(0)
}

switch (process.argv.slice(2)[0]) {
case 'watch':
  compile(true)
  break
case '--help':
case 'help':
  help()
  break
case 'build':
default:
  compile(false)
  break
}
