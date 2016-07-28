#!/usr/bin/env node
'use strict';

// To support `pidof horizon`, by default it shows in `pidof node`
process.title = 'horizon';

const chalk = require('chalk');
const path = require('path');

const initCommand = require('./init');
const serveCommand = require('./serve');
const versionCommand = require('./version');
const createCertCommand = require('./create-cert');
const schemaCommand = require('./schema');
const makeTokenCommand = require('./make-token');

// Mapping from command line strings to modules. To add a new command,
// add an entry in this object, and create a module with the following
// exported:
// - runCommand: main function for the command
// - helpText: a string to display in the hz help text
const commands = {
  init: initCommand,
  serve: serveCommand,
  version: versionCommand,
  'create-cert': createCertCommand,
  'make-token': makeTokenCommand,
  schema: schemaCommand,
};

const programName = path.basename(process.argv[1]);

function help() {
  console.log(`Usage: ${programName} subcommand [args...]`);
  console.log(`Available subcommands:`);
  Object.keys(commands).forEach(function (cmdName) {
    console.log(`  ${cmdName} - ${commands[cmdName].helpText}`);
  });
}

const allArgs = process.argv.slice(2);
if (allArgs.length == 0) {
  help();
  process.exit(1);
}

const cmdName = allArgs[0];
const cmdArgs = allArgs.slice(1);

if (cmdName == "-h" || cmdName == "--help" || cmdName == "help") {
  help();
  process.exit(0);
}

var command = commands[cmdName];
if (!command) {
  console.log(chalk.red.bold(
    `No such subcommand ${cmdName}, run with -h for help`));
  process.exit(1);
}

function done(err) {
  if (err) {
    console.log(chalk.red.bold(
      `${cmdName} failed ` +
      `with ${err.stack}`));
    process.exit(1);
  }
};

try {
  command.runCommand(cmdArgs, done);
} catch (e) {
  done(e);
}
