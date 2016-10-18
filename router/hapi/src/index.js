'use strict';

const HorizonBaseRouter = require('@horizon/base-router');

const ExpressRequest = require('express/lib/request');
const ExpressResponse = require('express/lib/response');

const handler = Symbol('handler');

class HorizonHapiRouter extends HorizonBaseRouter {
  constructor(...serverOptions) {
    super(...serverOptions);

    this[handler] = (request) => {
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
      const subpath =
        `/${request.paramArray[0] || ''}${request.paramArray[1] ? '/' : ''}`;
      const routeHandler = this.routes.get(subpath);

      if (routeHandler) {
        // RSI: hapi docs seem to indicate we shouldn't be fucking around with
        //  raw request/response so much
        req.res = res;
        res.req = req;
        req.next = next;
        // TODO: this kills the performance?
        Object.setPrototypeOf(req, ExpressRequest);
        Object.setPrototypeOf(res, ExpressResponse);
        routeHandler(req, res, next);
      } else {
        next();
      }
    };
  }

  handler() {
    return this[handler];
  }
}

module.exports = HorizonHapiRouter;

