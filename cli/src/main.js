#!/usr/bin/env node
'use strict';

const argparse = require('argparse');
const initCommand = require('./init');
const serveCommand = require('./serve');
const versionCommand = require('./version');
const createCertCommand = require('./create-cert');
const getSchemaCommand = require('./get-schema');
const setSchemaCommand = require('./set-schema');

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

initCommand.addArguments(initParser);
serveCommand.addArguments(serveParser);
getSchemaCommand.addArguments(getSchemaParser);
setSchemaCommand.addArguments(setSchemaParser);

const parsed = parser.parseArgs();

const done_cb = (options) => (err) => {
  if (err) {
    console.log(`${parsed.command_name} failed with ${options.debug ? err.stack : err}`);
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
}
