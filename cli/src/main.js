#!/usr/bin/env node
'use strict';

// To support `pidof horizon`, by default it shows in `pidof node`
process.title = 'horizon'

const argparse = require('argparse');
const chalk = require('chalk');
const initCommand = require('./init');
const serveCommand = require('./serve');
const versionCommand = require('./version');
const createCertCommand = require('./create-cert');
const getSchemaCommand = require('./get-schema');
const setSchemaCommand = require('./set-schema');
const makeTokenCommand = require('./make-token');

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

const versionParser = subparsers.addParser('version', { // eslint-disable-line no-unused-vars
  addHelp: true,
  help: 'Print the verison number of horizon',
});

const createCertParser = subparsers.addParser('create-cert', { // eslint-disable-line no-unused-vars
  addHelp: true,
  help: 'Generate a certificate',
});

const getSchemaParser = subparsers.addParser('get-schema', {
  addHelp: true,
  help: 'Get the schema from a horizon database',
});

const setSchemaParser = subparsers.addParser('set-schema', {
  addHelp: true,
  help: 'Set the schema in a horizon database',
});

const makeTokenParser = subparsers.addParser('make-token', {
  addHelp: true,
  help: 'Generate a token to log in as a user',
});

initCommand.addArguments(initParser);
serveCommand.addArguments(serveParser);
getSchemaCommand.addArguments(getSchemaParser);
setSchemaCommand.addArguments(setSchemaParser);
makeTokenCommand.addArguments(makeTokenParser);

const parsed = parser.parseArgs();

const done_cb = (options) => (err) => {
  if (err) {
    console.log(chalk.red.bold(`${parsed.command_name} failed ` +
                               `with ${options.debug ? err.stack : err}`));
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
case 'set-schema': {
  const options = setSchemaCommand.processConfig(parsed);
  setSchemaCommand.runCommand(options, done_cb(options));
  break;
}
case 'make-token': {
  const options = makeTokenCommand.processConfig(parsed);
  makeTokenCommand.runCommand(options, done_cb(options));
  break;
}
}
