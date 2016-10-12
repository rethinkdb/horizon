'use strict';

const HorizonBaseRouter = require('@horizon/base-router');

class HorizonKoaRouter extends HorizonBaseRouter {
  constructor(...serverOptions) {
    super(...serverOptions);
    this.koa = koa;
  }

  add(...args) {
    return super.add(...args);
    // RSI: add routes to koa server
  }

  remove(...args) {
    // RSI: remove routes from koa server
    return super.remove(...args);
  }

  close(...args) {
    // RSI: remove references from http servers
    return super.close(...args);
  }
}

module.exports = HorizonKoaRouter;
