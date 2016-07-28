#!/usr/bin/env node
'use strict';

// To support `pidof horizon`, by default it shows in `pidof node`
process.title = 'horizon';

const argparse = require('argparse');
const chalk = require('chalk');
const initCommand = require('./init');
const serveCommand = require('./serve');
const versionCommand = require('./version');
const createCertCommand = require('./create-cert');
const schemaCommand = require('./schema');
const makeTokenCommand = require('./make-token');

// Mapping from command line strings to modules. To add a new command,
// add an entry in this object, and create a module with the following
// exported:
// - processConfig: merge parsed command line options with config
// - runCommand: main function for the command
// - addArguments: receives a parser and adds any options it needs
// - helpText: a string to display in the hz help text
const commands = {
  init: initCommand,
  serve: serveCommand,
  version: versionCommand,
  'create-cert': createCertCommand,
  'make-token': makeTokenCommand,
  schema: schemaCommand,
};

function parseArgs() {
  const parser = new argparse.ArgumentParser();
  const subparsers = parser.addSubparsers({
    title: 'commands',
    dest: 'command_name',
  });

  Object.keys(commands).forEach((commandName) => {
    const command = commands[commandName];
    const subparser = subparsers.addParser(commandName, {
      addHelp: true,
      help: command.helpText,
    });
    command.addArguments(subparser);
  });

  return parser.parseArgs();
}

function runCommand(command, parsedOptions) {
  const options = command.processConfig(parsedOptions);
  const done = (err) => {
    if (err) {
      console.log(chalk.red.bold(
        `${parsedOptions.command_name} failed ` +
          `with ${options.debug ? err.stack : err}`));
      process.exit(1);
    }
  };
  try {
    command.runCommand(options, done);
  } catch (e) {
    done(e);
  }
}

const parsed = parseArgs();

runCommand(commands[parsed.command_name], parsed);
