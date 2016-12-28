'use strict';

const HorizonBaseRouter = require('@horizon/base-router');

const express = require('express');

const handler = Symbol('handler');

class HorizonHapiRouter extends HorizonBaseRouter {
  constructor(...serverOptions) {
    super(...serverOptions);

    // Make a dummy express app for the request/response objects
    const expressApp = express();

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
        `/${request.paramsArray[0] || ''}${request.paramsArray[1] ? '/' : ''}`;
      const routeHandler = this.routes.get(subpath);

      if (routeHandler) {
        // RSI: hapi docs seem to indicate we shouldn't be fucking around with
        //  raw request/response so much - this probably breaks major shit
        req.res = res;
        res.req = req;
        req.next = next;
        // TODO: this kills the performance?
        Object.setPrototypeOf(req, expressApp.request);
        Object.setPrototypeOf(res, expressApp.response);
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

