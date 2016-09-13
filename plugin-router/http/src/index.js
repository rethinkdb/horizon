'use strict';

const PluginRouterBase = require('@horizon/plugin-router-base');

class PluginRouterHttp extends PluginRouterBase {
  constructor(http, horizon) {
    super(horizon);
    this.http = http;
  }

  add(...args) {
    return super.add(...args);
    // RSI: add routes to http server
  }

  remove(...args) {
    // RSI: remove routes from http server
    return super.remove(...args);
  }
}

module.exports = PluginRouterHttp;
