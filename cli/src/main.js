#!/usr/bin/env node
'use strict';

const argparse = require('argparse');
const initCommand = require('./init');
const serveCommand = require('./serve');
const versionCommand = require('./version');
const createCertCommand = require('./create-cert');
const getSchemaCommand = require('./get-schema');

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

const getSchemaParser = subparsers.addParser('get-schema', {
  addHelp: true,
  help: 'Get the schema from a horizon database',
});

initCommand.addArguments(initParser);
serveCommand.addArguments(serveParser);
getSchemaCommand.addArguments(getSchemaParser);

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
case 'get-schema': {
  const options = getSchemaCommand.processConfig(parsed);
  getSchemaCommand.runCommand(options, done_cb(options));
  break;
}
}
