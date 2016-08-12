require('shelljs/global')

// remove existing lib files
rm('-rf', 'lib/**/*')

// compile with typescript
if (exec('tsc --outDir lib --module commonjs').code !== 0) {
  echo("Couldn't compile with typescript")
  exit(1)
}

// compile with babel
if (exec('babel src --out-dir lib --extends src/.babelrc --source-maps true').code !== 0) {
  echo('error: babel couldn\'t build source, if EACCESS error, check access rights')
  exit(1)
}

// generate typings
if (exec('tsc --outDir lib --declaration').code !== 0) {
  echo('Failed to generate typings')
  exit(1)
}
