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
      let req, res;
      const next = (err) => {
        if (err) {
          res.status(500).send(`${err}`).end();
        } else {
          res.sendStatus(404).end();
        }
      };

      // RSI: hapi docs seem to indicate we shouldn't be fucking around with
      //  raw request/response so much - this probably breaks major shit
      // Hapi probably needs some notification when we're done for their callbacks
      [req, res] = this._makeReqRes(app, request.raw.req, response.raw.res, next);

      // Assume wildcard matching was used (and only for subroutes of this router)
      // TODO: this may break some stuff if users try to get fancy
      const subpath =
        `/${request.paramsArray[0] || ''}${request.paramsArray[1] ? '/' : ''}`;
      const routeHandler = this.routes.get(subpath);

      if (routeHandler) {
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

