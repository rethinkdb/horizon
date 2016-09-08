'use strict';

const PluginRouterBase = require('@horizon/plugin-router-base');

class PluginRouterExpress extends PluginRouterBase {
  constructor(express, horizon) {
    super(horizon);
    this.express = express;
  }

  add(...args) {
    return super.add(...args).then((res) => {
      // RSI: add routes to express
      return res;
    });
  }

  remove(...args) {
    return super.remove(...args).then((res) => {
      // RSI: remove routes from express
      return res;
    });
  }
};

module.exports = PluginRouterExpress;

