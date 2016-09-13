'use strict';

const PluginRouterBase = require('@horizon/plugin-router-base');

class PluginRouterKoa extends PluginRouterBase {
  constructor(koa, horizon) {
    super(horizon);
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
}

module.exports = PluginRouterKoa;
