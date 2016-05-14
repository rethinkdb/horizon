#!/usr/bin/env node
'use strict';

const argparse = require('argparse');
const initCommand = require('./init.js');
const serveCommand = require('./serve.js');
const versionCommand = require('./version.js');
const createCertCommand = require('./create-cert.js');

const parser = new argparse.ArgumentParser();

const subparsers = parser.addSubparsers({
  title: 'commands',
  dest: 'command_name',
});

const initParser = subparsers.addParser('init', {
  addHelp: true,
  help: 'Initialize a horizon app directory',
});

const serveParser = subparsers.addParser('serve', {
  addHelp: true,
  help: 'Serve a horizon app',
});

const versionParser = subparsers.addParser('version', {
  addHelp: true,
  help: 'Print the verison number of horizon',
});

const createCertParser = subparsers.addParser('create-cert', {
  addHelp: true,
  help: 'Generate a certificate',
});

initCommand.addArguments(initParser);
serveCommand.addArguments(serveParser);

const parsed = parser.parseArgs();

const done_cb = (options) => (err) => {
  if (err) {
    console.log(`${parsed.command_name} failed with ${err}`);
    if (options.debug) {
      console.log(err.stack);
    }
    process.exit(1);
  }
};

switch (parsed.command_name) {
case 'init': {
  const options = initCommand.processConfig(parsed);
  initCommand.runCommand(options, done_cb(options));
  break;
}
case 'serve': {
  const options = serveCommand.processConfig(parsed);
  serveCommand.runCommand(options, done_cb(options));
  break;
}
case 'version': {
  versionCommand.runCommand();
  break;
}
case 'create-cert': {
  createCertCommand.runCommand();
  break;
}
}
