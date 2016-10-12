'use strict';

const HorizonBaseRouter = require('@horizon/base-router');

const expressRequest = require('express/lib/request.js');
const expressResponse = require('express/lib/response.js');

const pluginPath = Symbol('pluginPath');
const requestHandler = Symbol('requestHandler');

class HorizonHttpRouter extends HorizonBaseRouter {
  constructor(...serverOptions) {
    super(...serverOptions);
    this.routes = new Map();

    const pathPrefix = `/${server.options.path}`;
    this[pluginPath] = (name) => `${pathPrefix}/${name}/`;

    this[requestHandler] = (req, res) => {
      const next = (err) => {
        if (err) {
          res.statusCode = 500;
          res.end(`${err}`);
        } else {
          res.statusCode = 404;
          res.end();
        }
      };

      const url = url.parse(req.url);
      if (url.pathname.startsWith(pathPrefix) &&
          (url.pathname.length === pathPrefix.length ||
           url.pathname[pathPrefix.length] === '/')) {
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

  handler() {
    return this[requestHandler];
  }

  add(...args) {
    return super.add(...args).then((active) => {
      if (active.http) {
        this.routes.set(`/${active.name}/`, active.http);
      }
      return active;
    });
  }

  remove(name, ...args) {
    return Promise.resolve().then(() => {
      this.routes.delete(this[pluginPath](name));
      return super.remove(name, ...args);
    });
  }

  close(...args) {
    routes.clear();
    return super.close(...args);
  }
}

module.exports = HorizonHttpRouter;
