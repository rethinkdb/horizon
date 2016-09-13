'use strict';

const PluginRouterBase = require('@horizon/plugin-router-base');

class PluginRouterHttp extends PluginRouterBase {
  constructor(http, horizon) {
    super(horizon);
    this.http = http;
  }

  add(...args) {
    return super.add(...args).then((res) => {
      // RSI: add routes to http server
      return res;
    });
  }

  remove(...args) {
    return super.remove(...args).then((res) => {
      // RSI: remove routes from http server
      return res;
    });
  }
};

module.exports = PluginRouterHttp;
