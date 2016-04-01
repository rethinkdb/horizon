'use strict';

let handlers = [ ];

const on_interrupt = (cb) => {
  handlers.push(cb);
};

const run_handlers = () => {
  if (handlers.length === 0) {
    process.exit(0);
  } else {
    setImmediate(() => handlers.shift()(run_handlers));
  }
};

const shutdown = () => {
  process.removeAllListeners('SIGTERM');
  process.removeAllListeners('SIGINT');
  process.on('SIGTERM', () => process.exit(1));
  process.on('SIGINT', () => process.exit(1));

  run_handlers();
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

module.exports = { on_interrupt };
