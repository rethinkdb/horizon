'use strict';
const Promise = require('bluebird');
const childProcess = require('child_process');

function procPromise() {
  // Takes the same arguments as child_process.spawn
  const args = Array.prototype.slice.call(arguments);
  return new Promise((resolve, reject) => {
    const proc = childProcess.spawn.apply(childProcess, args);
    proc.stderr.setEncoding('utf8');
    proc.stdout.setEncoding('utf8');
    proc.on('exit', (code) => {
      if (code === 0) {
        resolve(proc);
      } else {
        const err = new Error(proc.stderr.read());
        err.exitCode = code;
        reject(err);
      }
    });
  });
}

module.exports = procPromise;
