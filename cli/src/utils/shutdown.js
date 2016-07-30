'use strict';

const handlers = [ ];

const on_shutdown = (cb) => {
  handlers.push(cb);
};

const run_handlers = () => {
  if (handlers.length > 0) {
    return handlers.shift()().then(() => run_handlers);
  }
};

const shutdown = () => {
  process.removeAllListeners('SIGTERM');
  process.removeAllListeners('SIGINT');
  process.on('SIGTERM', () => process.exit(1));
  process.on('SIGINT', () => process.exit(1));

  return run_handlers();
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

module.exports = { on_shutdown, shutdown };
