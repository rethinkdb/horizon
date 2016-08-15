'use strict';

// RSI: check connection
module.exports = (config) => {
  return {
    name: 'permissions',
    activate: (ctx) => {

      ctx.logger.info('Activating permissions.');
      return {
        middleware: (req, res, next) => {
          const currentUser = req.userFeed
        },
      };
    },
    deactivate: (reason) => {
      ctx.logger.info(`Deactivating health-check module (${reason}).`)
    },
  };
}
