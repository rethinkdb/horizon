'use strict';
const hasbin = require('hasbin');
const spawn = require('child_process').spawn;

const run = (args) => {
  if (args.length) {
    throw new Error('create-cert takes no arguments');
  }

  // TODO: user configuration?
  const settings = {
    binaryName: 'openssl',
    keyOutName: 'horizon-key.pem',
    certOutName: 'horizon-cert.pem',
    algo: 'rsa',
    bits: '2048',
    days: '365',
  };

  // generate the arguments to the command
  const binArgs = [ 'req', '-x509', '-nodes', '-batch',
    '-newkey', `${settings.algo}:${settings.bits}`,
    '-keyout', settings.keyOutName,
    '-out', settings.certOutName,
    '-days', settings.days,
  ];

  return new Promise((resolve, reject) => {
    hasbin(settings.binaryName, (hasOpenSSL) => {
      // show the invocation that's about to be run
      console.log(`> ${settings.binaryName} ${binArgs.join(' ')}`);

      // if we don't have openssl, bail
      if (!hasOpenSSL) {
        reject(new Error(`Missing ${settings.binaryName}. Make sure it is on the path.`));
      }

      // otherwise start openssl
      const sslProc = spawn(settings.binaryName, binArgs);

      // pipe output appropriately
      sslProc.stdout.pipe(process.stdout, { end: false });
      sslProc.stderr.pipe(process.stderr, { end: false });

      // say nice things to the user when it's done
      sslProc.on('error', reject);
      sslProc.on('close', (code) => {
        if (code) {
          reject(new Error(`OpenSSL failed with code ${code}.`));
        } else {
          console.log('Everything seems to be fine. ' +
                      'Remember to add your shiny new certificates to your Horizon config!');
          resolve();
        }
      });
    });
  });
};

module.exports = {
  run,
  description: 'Generate a certificate',
};
