#!/usr/bin/env node
'use strict'

const fs = require('fs'),
      browserify = require('browserify'),
      watchify = require('watchify'),
      exorcist = require('exorcist'),
      program = require("commander");

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
    .transform('uglifyify', {
      // uglify all sources, not just application code
      global: true,
    })

  if (watching) {
    bundler.on('update', function() {
      console.log('-> bundling...');
      rebundle(bundler);
    })
    bundler.on('log', msg => {
      console.log(msg);
      console.log('Watching for changes...');
    })
  } else {
    bundler.on('log', msg => {
      console.log(msg);
      bundler.close();
    })
  }

  rebundle(bundler)
}

function rebundle(bundler) {
  bundler.bundle()
    .on('error', (err) => {
      console.error(err);
      bundler.emit('end');
    })
    // exorcist splits out map to a separate file
    .pipe(exorcist(`${BUILD_DIR}/fusion.js.map`))
    // The unmapped remainder is the code itself
    .pipe(fs.createWriteStream(`${BUILD_DIR}/fusion.js`), 'utf8');
}

program
  .version("0.0.1")
  .option("-w, --watch", "Watch directory for changes");

program
  .command("build")
  .action( (command) => {
    compile(program.watch);
  });

program.parse(process.argv);
