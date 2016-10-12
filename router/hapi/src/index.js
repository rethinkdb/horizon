'use strict';

const HorizonBaseRouter = require('@horizon/base-router');

const expressRequest = require('express/lib/request.js');
const expressResponse = require('express/lib/response.js');

const routeHandler = Symbol('routeHandler');

class HorizonHapiRouter extends HorizonBaseRouter {
  constructor(...serverOptions) {
    super(...serverOptions);
    this.routes = new Map();

    this[routeHandler] = (request, reply) => {
      const next = (err) => {
        if (err) {
          res.statusCode = 500;
          res.end(`${err}`);
        } else {
          res.statusCode = 404;
          res.end();
        }
      };

      if (request.path.startsWith(pathPrefix) &&
          (request.path.length === pathPrefix.length ||
           request.path[pathPrefix.length] === '/')) {
        const subpathEnd = url.pathname.indexOf('/', pathPrefix.length + 1);
        const subpath = subpathEnd === -1 ?
          url.pathname.substring(pathPrefix.length) :
          url.pathname.substring(pathPrefix.length, subpathEnd + 1);

        const handler = this.routes.get(subpath);

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
      } else {
        next();
      }
    };
  }

  routeHandler() {
    return this[routeHandler];
  }

  add(...args) {
    return super.add(...args).then((active) => {
      if (active.http) {
        this.routes.set(`/${active.name}/`);
      }
      return active;
    });
  }

  remove(name, ...args) {
    return Promise.resolve().then(() => {
      this.routes.delete(`/${name}/`);
      return super.remove(name, ...args);
    });
  }

  close(...args) {
    return Promise.resolve().then(() => {
      routes.clear();
      return super.close(...args);
    });
  }
}

module.exports = HorizonHapiRouter;

