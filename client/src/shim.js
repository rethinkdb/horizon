'use strict';

// Some constants from `process.env` are included in the package for now.
// See `DefinePlugin` in webpack config.
/* global process */

// Importing eio here is a bit subtle, due to the way browser packaging works.
// Horizon is webpacked in browser mode, and thus also the dependencies
// of eio, such as `engine.io-parser`, are required by their `browser` field
// in `package.json`, instead of the `main` field. This would cause the horizon
// client to be unrunnable in node tests without modification. So here we'll
// simply require the pre-packaged browser bundle directly, or the main
// lib, depending on which runtime environment we are in. The imports won't
// inflate the size of the package because `engine.io-client` is listed as an
// external in webpack config, thus omitting it from package.
// A longer term solution could be to build the browser and node bundles
// separately (and there is currently the `lib` dir which could be used
// directly), and thus also test them separately.

// In non-polyfilled version eio is imported from `window.eio`.

const eio = (typeof window !== 'undefined' && window.document) ?
  require('engine.io-client/engine.io.js') :
  require('engine.io-client')

class EioWebSocket {
  constructor(hostString, protocol) {
    // To keep it lean, there's no event emitter api here (e.g. `.on('message')`).
    this.onerror = null
    this.onopen = null
    this.onmessage = null
    this.onclose = null
    this.readyState = 0

    this._errorEvent = null
    this._closeEvent = null

    // May throw
    const eioSocket = this.eioSocket = eio(hostString, {
      // TODO proper path parsing from hostString
      path: hostString.match(/.*(\/[^?]+)/)[1],
      // Sends protocol via a query parameter for now.
      query: { protocol: protocol },
      upgrade: true,
      forceJSONP: false,
      jsonp: false,
      // Let's disable binary transports for now
      forceBase64: true,
      enablesXDR: false,
      timestampParam: 't',
      timestampRequests: true,
      transports: [ 'polling', 'websocket' ],
      rememberUpgrade: false,
      onlyBinaryUpgrades: false,
      perMessageDeflate: false // default { threshold: 1024 },
    });

    eioSocket.on('handshake', data => {
      data.upgrades = data.upgrades
      data.pingInterval = data.pingInterval
      // Decreases pingTimeout to detect broken sockets sooner.
      // NOTE: due to engine.io internals, ping timeout can still be longer
      // in practice (there are logic mistakes in heartbeat handling)
      data.pingTimeout = 10000;
      // You can delete unneeded query params after handshake to save bytes in
      // polling, or keep them for routing and logging
      delete eioSocket.transport.query.b64;
      delete eioSocket.transport.query.EIO;
      delete eioSocket.transport.query.protocol;
    })

    eioSocket.on('open', () => {
      this.readyState = 1;
      this.onopen && this.onopen()
    })

    eioSocket.on('message', str => {
      if (this.onmessage && str.charAt(0) !== '_') {
        this.onmessage({ data: str })
      } else {
        this._closeEvent = JSON.parse(str.substr(1))
      }
    })

    eioSocket.on('close', reason => {
      // common reasons: 'transport error', 'ping timeout', 'forced close'
      this.readyState = 3
      const isError = (this._errorEvent || (reason !== 'forced close'))
      const finalEvent = {
        code: isError ? 1006 : 1000,
        wasClean: Boolean(isError),
        reason: reason,
      }
      finalEvent.code =
        (this._closeEvent && this._closeEvent.code) ||
        finalEvent.code

      finalEvent.reason =
        (this._closeEvent && this._closeEvent.reason) ||
        (this._errorEvent && this._errorEvent.message) ||
        finalEvent.reason

      // Defer so that HorizonSocket can remove its onclose handlers when self closing
      setTimeout(() => {
        this.onclose && this.onclose(finalEvent)
      }, 0)
    })

    eioSocket.on('error', error => {
      // We don't know what kind of an error we get, so try to get some info.
      // Common errors: 'xhr poll error', 'server error', 'websocket error'
      this._errorEvent = (error instanceof Error) ? error : new Error(error)
      if (error && error.description) {
        this._errorEvent.message =
          `${this._errorEvent.message || ''}: ${error.description}`
      }

      // Note: Grab eioSocket.writeBuffer if you really need it.
      this.onerror && this.onerror(this._errorEvent)

      // TODO perhaps call `this.close(1006)` or `eioSocket.close()` here,
      // or perhaps even `eioSocket.transport.close('reason')`, but for
      // the moment it seems that `socket.close` gets called via other means.
      // Revisit this when reconnection logic is implemented in higher layer.
    })

    // TODO What kind of guarantees there are for re-entrancy and idempotency
    // in case of errors, double closes, etc.
    // TODO Tests for transport breakage. For example, test that if `upgadeError`
    // comes after 'upgrading' but before 'upgraded', the socket won't be broken
    // for socket timeout (10 s) as in some previous versions of eio.
    // If disconnect or error happens during an upgrade, a GET request could also
    // stay hanging. It should not matter (will typically error after keepalive
    // timeout of 2 mins), but it could reserve browser connection pool.
    // Rudimentary tests can be implemented by listening for specific events,
    // such as `upgrading` and then breaking the transport by
    // `eioSocket.transport.ws.close()` or
    // if (eioSocket.transport.pollXhr.xhr !== null)
    //   eioSocket.transport.pollXhr.abort();
    // etc.
  }

  // Callback argument is very non-standard, but included here as both ws and
  // engine.io-client support it.
  send(str, callback) {
    this.eioSocket.send(str, callback)
  }

  close(code /* , reason*/) {
    if (code && code !== 1000) {
      throw new Error('socket.close(code, reason) is unimplemented')
    }

    if (this.readyState < 2) {
      this.readyState = 2

      // Client->Server close codes are not used yet.
      // if (arguments.length) {
      //   this.eioSocket.send('_' + JSON.stringify({code: code, reason: reason}))
      // }
      this.eioSocket.close()
    }
  }
}

// WebSocket readyStates
EioWebSocket.CONNECTING = 0
EioWebSocket.OPEN = 1
EioWebSocket.CLOSING = 2
EioWebSocket.CLOSED = 3

// Use engine.io-client if not disabled in build
if (
  !process.env.NO_EIO ||
  String(process.env.NO_EIO) === 'false' ||
  String(process.env.NO_EIO) === '0'
) {
  module.exports.WebSocket = EioWebSocket
} else if (typeof WebSocket !== 'undefined') {
  module.exports.WebSocket = WebSocket
} else {
  module.exports.WebSocket = () => {
    console.error('Tried to use WebSocket but it isn\'t defined or polyfilled')
  }
}
