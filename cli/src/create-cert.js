'use strict';
const hasbin = require('hasbin');
const spawn = require('child_process').spawn;
const runCommand = () => {
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

  hasbin(settings.binaryName, function(hasOpenSSL) {
    // show the invocation that's about to be run
    console.log(`> ${settings.binaryName} ${binArgs.join(' ')}`);
    // if we don't have openssl, bail
    if (!hasOpenSSL) {
      return console.error(`Missing ${settings.binaryName}. Make sure it is on the path.`);
    }

    // otherwise start openssl
    const sslProc = spawn(settings.binaryName, binArgs);

    // pipe output appropriately
    sslProc.stdout.pipe(process.stdout, { end: false });
    sslProc.stderr.pipe(process.stderr, { end: false });

    // and say nice things to the user when it's done
    sslProc.on('close', (code) => {
      console.log(`OpenSSL exited with code ${code}.`);
      if (code) {
        return console.error(
          'Something seems to have gone wrong; ' +
          'check the output above for details.'
        );
      } else {
        return console.log(
          'Everything seems to be fine. ' +
          'Remember to add your shiny new certificates to your Horizon config!'
        );
      }
    });
  });
};

module.exports = {
  runCommand,
};