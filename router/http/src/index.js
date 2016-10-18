'use strict';

const HorizonBaseRouter = require('@horizon/base-router');

const url = require('url');

const ExpressRequest = require('express/lib/request');
const ExpressResponse = require('express/lib/response');

const handler = Symbol('handler');

class HorizonHttpRouter extends HorizonBaseRouter {
  constructor(...serverOptions) {
    super(...serverOptions);

    this[handler] = (req, res) => {
      const next = (err) => {
        if (err) {
          res.statusCode = 500;
          res.end(`${err}`);
        } else {
          res.statusCode = 404;
          res.end();
        }
      };

      const routeHandler = this._handlerForPath(url.parse(req.url).pathname);
      if (routeHandler) {
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

module.exports = HorizonHttpRouter;
