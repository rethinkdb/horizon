'use strict';

const HorizonBaseRouter = require('@horizon/base-router');

const expressRequest = require('express/lib/request.js');
const expressResponse = require('express/lib/response.js');

const handler = Symbol('handler');

class HorizonHapiRouter extends HorizonBaseRouter {
  constructor(...serverOptions) {
    super(...serverOptions);
    this.routes = new Map(this.defaultRoutes);

    this[handler] = (request, reply) => {
      const req = request.raw.req;
      const res = request.raw.res;
      const next = (err) => {
        if (err) {
          res.statusCode = 500;
          res.end(`${err}`);
        } else {
          res.statusCode = 404;
          res.end();
        }
      };

      // Assume wildcard matching was used (and only for subroutes of this router)
      // TODO: this may break some stuff if users try to get fancy
      const subpath = `/${request.paramArray[0] || ''}${request.paramArray[1] ? '/' : ''}`
      const handler = this.routes.get(subpath);

      if (handler) {
        // RSI: hapi docs seem to indicate we shouldn't be fucking around with raw request/response so much
        req.res = res;
        res.req = req;
        req.next = next;
        req.__proto__ = expressRequest;
        res.__proto__ = expressResponse;
        handler(req, res, next);
      } else {
        next();
      }
    };
  }

  handler() {
    return this[handler];
  }

  add(...args) {
    return super.add(...args);
  }

  remove(...args) {
    return super.remove(...args);
  }

  close(...args) {
    return super.close(...args);
  }
}

module.exports = HorizonHapiRouter;

