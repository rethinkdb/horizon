module.exports = {
  connection: {
    PROTOCOL_VERSION: 'rethinkdb-horizon-v0',
    // Before connecting the first time
    STATUS_UNCONNECTED: { type: 'unconnected' },
    // After websocket is opened, but before handshake
    STATUS_CONNECTED: { type: 'connected' },
    // After websocket is opened and handshake is completed
    STATUS_READY: { type: 'ready' },
    // After unconnected, maybe before or after connected.
    // Any socket level error
    STATUS_ERROR: { type: 'error' },
    // When the socket closes
    STATUS_DISCONNECTED: { type: 'disconnected' },
  },
  auth: {
    TYPE_UNAUTHENTICATED: 'unauthenticated',
    TYPE_ANONYMOUS: 'anonymous',
    TYPE_TOKEN: 'token',
    HORIZON_JWT: 'horizon-jwt',
  },
}
