'use strict';

const HorizonBaseRouter = require('@horizon/base-router');

const expressRequest = require('express/lib/request.js');
const expressResponse = require('express/lib/response.js');

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

      const handler = this._handlerForPath(url.parse(req.url).pathname);
      if (handler) {
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

module.exports = HorizonHttpRouter;
