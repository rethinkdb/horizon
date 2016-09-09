'use strict';

const PluginRouterBase = require('@horizon/plugin-router-base');

class PluginRouterHapi extends PluginRouterBase {
  constructor(hapi, horizon) {
    super(horizon);
    this.hapi = hapi;
  }

  add(...args) {
    return super.add(...args).then((res) => {
      // RSI: add routes to hapi
      return res;
    });
  }

  remove(...args) {
    return super.remove(...args).then((res) => {
      // RSI: remove routes from hapi
      return res;
    });
  }
};

module.exports = PluginRouterHapi;

