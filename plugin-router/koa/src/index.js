'use strict';

const PluginRouterBase = require('@horizon/plugin-router-base');

class PluginRouterKoa extends PluginRouterBase {
  constructor(koa, horizon) {
    super(horizon);
    this.koa = koa;
  }

  add(...args) {
    return super.add(...args).then((res) => {
      // RSI: add routes to koa server
      return res;
    });
  }

  remove(...args) {
    return super.remove(...args).then((res) => {
      // RSI: remove routes from koa server
      return res;
    });
  }
};

module.exports = PluginRouterKoa;
