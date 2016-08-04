'use strict';

const hzc = require("hzc-client-updater");

const helpText = 'Access Horizon Cloud';

const runCommand = (args, done) => {
  hzc.runHzcClient(args).then(function(){
    done();
  }, function (err) {
    done(err);
  });
};

module.exports = {
  runCommand,
  helpText,
};
