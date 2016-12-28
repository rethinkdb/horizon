'use strict';

const HorizonBaseRouter = require('@horizon/base-router');

const url = require('url');
const express = require('express');

const handler = Symbol('handler');

class HorizonHttpRouter extends HorizonBaseRouter {
  constructor(...serverOptions) {
    super(...serverOptions);

    // Make a dummy express app for the request/response objects
    const app = express();

    this[handler] = (req, res) => {
      const next = (err) => {
        if (err) {
          res.statusCode = 500;
          res.end(`${err.stack}`);
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
        // TODO: supposedly this kills the performance?
        Object.setPrototypeOf(req, app.request);
        Object.setPrototypeOf(res, app.response);
        try {
          routeHandler(req, res, next);
        } catch (err) {
          next(err);
        }
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
