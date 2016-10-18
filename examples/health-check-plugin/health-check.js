'use strict';

// RSI: check connection
module.exports = {
  name: 'healthCheck',
  activate: (context, options) => {
    context.horizon.events.emit('log', 'debug', 'health-check plugin activated');
    return {
      commands: {
        'health-check': (args) => {
        },
      },
      httpRoute: (req, res, next) => {
        res.send("healthy");
      },
      methods: {
        'healthCheck': {
          type: 'terminal',
          handler: (req, res, next) => {
            res.end({op: 'replace', path: '', value: {type: 'value', synced: true, val: 'healthy'}});
          },
        },
      },
    };
  },
  deactivate: (context, options) => {
    context.horizon.events.emit('log', 'debug', 'health-check plugin deactivated');
  },
};
