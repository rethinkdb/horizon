'use strict';

// RSI: check connection
module.exports = (config) => {
  return {
    name: 'health-check',
    activate: (ctx) => {
      ctx.logger.info('Activating health-check module.');
      return {
        commands: {
          'health-check': (args) => {
            console.log(`Got ${JSON.stringify(args)}.`);
          },
        },
        httpRoute: (req, res, next) => {
          console.log(`httpRoute: ${[req, res, next]}`)
          res.send("healthy");
        },
        methods: {
          'healthCheck': {
            requires: ['hz_permissions'],
            type: 'terminal', // or `middleware` or `preReq`
            impl: (req, res, next) => {
              console.log(`healthCheck method: ${[req, res, next]}`)
              res.send("healthy");
            },
          },
        },
        middleware: (req, res, next) => {
          req.healthy = true;
          next();
        },
      };
    },
    deactivate: (reason) => {
      ctx.logger.info(`Deactivating health-check module (${reason}).`)
    },
  };
}
