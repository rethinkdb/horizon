const Rx = require('rx')
const { Collection } = require('./ast')
const HorizonSocket = require('./socket')
const { log, logError, enableLogging } = require('./logging')
const { authEndpoint, TokenStorage } = require('./auth')

const defaultHost = window && window.location &&
        `${window.location.host}` || 'localhost:8181'
const defaultSecure = window && window.location &&
        window.location.protocol === 'https:' || false

function Horizon({
  host = defaultHost,
  secure = defaultSecure,
  path = 'horizon',
  lazyWrites = false,
  authType = 'unauthenticated',
} = {}) {
  // If we're in a redirection from OAuth, store the auth token for
  // this user in localStorage.
  const tokenStorage = new TokenStorage(authType)
  tokenStorage.setAuthFromQueryParams()

  // Websocket Subject
  const socket = new HorizonSocket(host, secure, path, tokenStorage.handshake())

  // Store whatever token we get back from the server when we get a
  // handshake response
  socket.handshake.subscribe(
    handshake => tokenStorage.maybeSaveToken(authType, handshake.token)
  )

  // This is the object returned by the Horizon function. It's a
  // function so we can construct a collection simply by calling it
  // like horizon('my_collection')
  function horizon(name) {
    return new Collection(sendRequest, name, lazyWrites)
  }

  horizon.dispose = () => {
    socket.onCompleted()
  }

  // Dummy subscription to force it to connect to the
  // server. Optionally provide an error handling function if the
  // socket experiences an error.
  // Note: Users of the Observable interface shouldn't need this
  horizon.connect = (
    onError = err => { console.error(`Received an error: ${err}`) }
  ) => {
    socket.subscribe(
      () => {},
      onError
    )
  }

  // Either subscribe to status updates, or return an observable with
  // the current status and all subsequent status changes.
  horizon.status = subscribeOrObservable(socket.status)

  // Convenience method for finding out when disconnected
  horizon.onDisconnected = subscribeOrObservable(
    socket.status.filter(x => x.type === 'disconnected'))

  // Convenience method for finding out when opening
  horizon.onConnected = subscribeOrObservable(
    socket.status.filter(x => x.type === 'connected'))

  // Convenience method for finding out when an error occurs
  horizon.onSocketError = subscribeOrObservable(
    socket.status.filter(x => x.type === 'error'))

  horizon._authMethods = null
  horizon._horizonPath = path
  horizon.authEndpoint = authEndpoint

  return horizon

  // Sends a horizon protocol request to the server, and pulls the data
  // portion of the response out.
  function sendRequest(type, options) {
    // Both remove and removeAll use the type 'remove' in the protocol
    const normalizedType = type === 'removeAll' ? 'remove' : type
    return socket
      .makeRequest({ type: normalizedType, options }) // send the raw request
      .concatMap(resp => {
        // unroll arrays being returned
        if (resp.data) {
          return resp.data
        } else {
          // Still need to emit a document even if we have no new data
          return [ { state: resp.state, type: resp.type } ]
        }
      })
      .catch(e => Rx.Observable.create(observer => {
        observer.onError(new Error(e.error))
      })) // on error, strip error message
  }
}

function subscribeOrObservable(observable) {
  return (...args) => {
    if (args.length > 0) {
      return observable.subscribe(...args)
    } else {
      return observable
    }
  }
}


Horizon.log = log
Horizon.logError = logError
Horizon.enableLogging = enableLogging
Horizon.Socket = HorizonSocket

module.exports = Horizon
