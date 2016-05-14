require('shelljs/global')

// remove existing lib files
rm('-rf', 'lib/**/*')

// compile with babel
if (exec('babel src --out-dir lib --extends src/.babelrc --source-maps true').code !== 0) {
  echo('error: babel couldn\'t build source, if EACCESS error, check access rights')
  exit(1)
}
