#!/usr/bin/env node
'use strict';

const argparse = require('argparse');
const initCommand = require('./init.js');
const serveCommand = require('./serve.js');

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

initCommand.addArguments(initParser);
serveCommand.addArguments(serveParser);

const parsed = parser.parseArgs();

try {
  switch (parsed.command_name) {
  case 'init': {
    const options = initCommand.processConfig(parsed);
    initCommand.runCommand(options);
    break;
  }
  case 'serve': {
    const options = serveCommand.processConfig(parsed);
    serveCommand.runCommand(options);
    break;
  }
  }
} catch (err) {
  console.log(`${parsed.command_name} failed with ${err}`);
  process.exit(1);
}
