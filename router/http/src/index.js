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

    this[handler] = (request, response) => {
      let req, res;
      const next = (err) => {
        if (err) {
          res.status(500).send(`${err.stack}`).end();
        } else {
          res.sendStatus(404).end();
        }
      };

      [req, res] = this._makeReqRes(app, request, response, next);

      const routeHandler = this._handlerForPath(url.parse(req.url).pathname);
      if (routeHandler) {
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
