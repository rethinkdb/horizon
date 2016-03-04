'use strict';

const eio = require('engine.io');

// Create a constructor that mimics ws.Server, but returns an EioServer instance.
// The api is otherwise quite compatible (`connection`, `message`, `send`,
// `close` etc), so it is ok that the socket instances are used elsewhere as-is.

class EioServer {
  constructor(opts) {
    const eio_server = new eio.Server({
      path: opts.path,
      // eio_server will expect any data in pingInterval + pingTimeout or it
      // will close the eio_socket with 'ping timeout'. Both parameters are
      // transferred to the client, and it is client's responsibility to
      // periodically ping the server. In client, pingTimeout means the time
      // until server response, so these server-sent parameters are customized
      // there for client use.
      pingTimeout: 60000,
      pingInterval: 25000,
      upgradeTimeout: 10000,
      maxHttpBufferSize: 10E7,
      transports: [ 'polling', 'websocket' ],
      // Disable `allowUpgrades` if you want to test just polling
      allowUpgrades: true,
      allowRequest: (req, fn) => {
        const protocols = (req._query.protocol || '').split(/, */);
        opts.handleProtocols(protocols, (result /* , protocol */) => {
          if (!result) {
            fn(401, false);
            return;
          }
          opts.verifyClient(null, (success, code /* , reason */) => {
            if (!success) {
              fn(code, false);
              return;
            }
            fn(null, true);
          });
        });
      },
      cookie: false, // or name for sticky load balancing
      cookiePath: false,
      // Websocket compression will tax the server quite a lot, enable when possible.
      perMessageDeflate: false, // default { threshold: 1024 },
      // httpCompression should be done via nginx or similar, enable when possible.
      httpCompression: false, // default { threshold: 1024 },
    });

    // Call stack to eio_server request handling could be shortened later:
    // eio_server.attach method is quite simple to unwrap.
    eio_server.attach(opts.server, {
      path: opts.path,
      destroyUpgrade: true,
      destroyUpgradeTimeout: 1000,
    });

    // Return eio_server which is compatible with ws.Server
    return eio_server;
  }
}

// Patch eio_socket.close() to tolerate WebSocket#close(code, reason) arguments
const original_close = eio.Socket.prototype.close;
eio.Socket.prototype.close = function close(discard_or_code, reason) {
  let discard = (discard_or_code === true);
  if (discard) {
    // Only called internally by eio in eio_server.close()
    original_close.call(this, true);
    return;
  }
  let code = (typeof discard_or_code === 'number') ? discard_or_code : null;
  if (code !== null && code !== 1000) {
    // WebSocket/ws close code workaround, sends a special message
    this.send('_' + JSON.stringify({ code: code, reason: reason }));
    setImmediate(() => {
      original_close.call(this);
    });
    return;
  }
  // Else ordinary eio_socket.close() call
  original_close.call(this);
};

module.exports =
  (process.env.NO_EIO === 'true' || process.env.NO_EIO === '1') ?
  require('ws') :
  {
    // Emulate ws server api
    Server: EioServer,
    // WebSocket readyStates <> EioSocket readyStates
    CONNECTING: 'opening',
    OPEN: 'open',
    CLOSING: 'closing',
    CLOSED: 'closed',
  };
