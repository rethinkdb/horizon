'use strict';

const handlers = [ ];

const on_interrupt = (cb) => {
  handlers.push(cb);
};

const run_handlers = () => {
  if (handlers.length > 0) {
    console.log(`running interrupt handler:\n${handlers[handlers.length - 1]}`);
    return handlers.shift()().then(() => run_handlers);
  } else {
    console.log('no more interrupt handlers');
  }
};

const interrupt = () => {
  process.removeAllListeners('SIGTERM');
  process.removeAllListeners('SIGINT');
  process.on('SIGTERM', () => process.exit(1));
  process.on('SIGINT', () => process.exit(1));

  return run_handlers();
};

process.on('SIGTERM', interrupt);
process.on('SIGINT', interrupt);

module.exports = { on_interrupt, interrupt };
