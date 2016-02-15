'use strict';

const fs = require('fs');

const indexHTML = `\
<!doctype html>
<html>
  <head>
    <meta charset="UTF-8">
    <script src="/horizon/horizon.js"></script>
    <script>
      var horizon = Horizon();
      horizon.onConnected(function() {
        document.querySelector('h1').innerHTML = 'It works!'
      });
      horizon.onSocketError(e => console.log('booty', e));
      horizon.connect();
    </script>
  </head>
  <body>
   <marquee><h1></h1></marquee>
  </body>
</html>
`;

const addArguments = (parser) => {
  parser.addArgument([ 'projectName' ],
    { action: 'store',
      help: 'Name of directory to create. Defaults to current directory',
      nargs: '?',
    }
  );
};

const fileDoesntExist = (path) => {
  try {
    fs.statSync(path);
    console.error(`Bailing! ${path} already exists`);
    process.exit(1);
  } catch (e) {
    return true;
  }
};

const processConfig = (parsed) => {
  // Nothing needs to be done
  return parsed;
};

const runCommand = (parsed) => {
  if (parsed.projectName !== null &&
      fileDoesntExist(parsed.projectName)) {
    fs.mkdirSync(parsed.projectName);
    console.log(`Created new project directory ${parsed.projectName}`);
    process.chdir(parsed.projectName);
  } else {
    console.log(`Creating new project in current directory`);
  }

  if (fileDoesntExist('src')) {
    fs.mkdirSync('src');
  }
  if (fileDoesntExist('dist')) {
    fs.mkdirSync('dist');
    fs.appendFileSync('./dist/index.html', indexHTML);
  }
  if (fileDoesntExist('.hzconfig')) {
    fs.appendFileSync('.hzconfig', '');
  }
};


module.exports = {
  addArguments,
  runCommand,
  processConfig,
};
