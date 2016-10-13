'use strict';

const HorizonBaseRouter = require('@horizon/base-router');

function HorizonKoaRouter(...serverOptions) {
  let closed = false;
  const baseRouter = new HorizonBaseRouter(...serverOptions);

  // RSI: this code relies on us being mounted at the same path as the websocket server
  const pathPrefix = `/${baseRouter.server.options.path}`;
  
  function add(...args) {
    return baseRouter.add(...args);
  }

  function remove(...args) {
    return baseRouter.remove(...args);
  }

  function close(...args) {
    closed = true;
    return baseRouter.close(...args);
  }

  function *middleware(next, ctx) {
    if (!closed) {
      const handler = baseRouter._handlerForPath(ctx.path);
      if (handler)
        handler(ctx.request, ctx.response);
        return;
      }
    }

    yield* next();
  }

  middleware.add = add;
  middleware.remove = remove;
  middleware.close = close;
  middleware.server = baseRouter.server;
  middleware.pluginContext = baseRouter.pluginContext;

  return middleware;
}

module.exports = HorizonKoaRouter;
