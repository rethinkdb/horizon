'use strict';

const PluginRouterBase = require('@horizon/plugin-router-base');

class PluginRouterHapi extends PluginRouterBase {
  constructor(hapi, horizon) {
    super(horizon);
    this.hapi = hapi;
  }

  add(...args) {
    return super.add(...args);
    // RSI: add routes to hapi
  }

  remove(...args) {
    // RSI: remove routes from hapi
    return super.remove(...args);
  }
}

module.exports = PluginRouterHapi;

