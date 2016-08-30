import 'rxjs/add/observable/of'
import 'rxjs/add/observable/from'
import 'rxjs/add/operator/catch'
import 'rxjs/add/operator/concatMap'
import 'rxjs/add/operator/map'
import 'rxjs/add/operator/filter'

import { Collection, UserDataTerm } from './ast'
import { HorizonSocket } from './socket'
import { authEndpoint, TokenStorage, clearAuthTokens } from './auth'
import { aggregate, model } from './model'

const defaultHost = typeof window !== 'undefined' && window.location &&
        `${window.location.host}` || 'localhost:8181'
const defaultSecure = typeof window !== 'undefined' && window.location &&
        window.location.protocol === 'https:' || false

function Horizon({
  host = defaultHost,
  secure = defaultSecure,
  path = 'horizon',
  lazyWrites = false,
  authType = 'unauthenticated',
  keepalive = 60,
  WebSocketCtor,
  websocket,
} = {}) {
  // If we're in a redirection from OAuth, store the auth token for
  // this user in localStorage.

  const tokenStorage = new TokenStorage({ authType, path })
  tokenStorage.setAuthFromQueryParams()

  const url = `ws${secure ? 's' : ''}:\/\/${host}\/${path}`
  const hzSocket = new HorizonSocket({
    url,
    handshakeMaker: tokenStorage.handshake.bind(tokenStorage),
    keepalive,
    WebSocketCtor,
    websocket,
  })

  // We need to filter out null/undefined handshakes in several places
  const filteredHandshake = hzSocket.handshake.filter(x => x != null)

  // Store whatever token we get back from the server when we get a
  // handshake response
  filteredHandshake.subscribe({
    next(handshake) {
      if (authType !== 'unauthenticated') {
        tokenStorage.set(handshake.token)
      }
    },
    error(err) {
      if (/JsonWebTokenError|TokenExpiredError/.test(err.message)) {
        console.error('Horizon: clearing token storage since auth failed')
        tokenStorage.remove()
      }
    },
  })

  // This is the object returned by the Horizon function. It's a
  // function so we can construct a collection simply by calling it
  // like horizon('my_collection')
  function horizon(name) {
    return new Collection(sendRequest, name, lazyWrites)
  }

  horizon.currentUser = () =>
    new UserDataTerm(
      horizon,
      filteredHandshake,
      hzSocket
    )

  horizon.disconnect = () => {
    hzSocket.complete()
  }

  // Dummy subscription to force it to connect to the
  // server. Optionally provide an error handling function if the
  // socket experiences an error.
  // Note: Users of the Observable interface shouldn't need this
  horizon.connect = (
    onError = err => { console.error(`Received an error: ${err}`) }
  ) => {
    hzSocket.subscribe(
      () => {},
      onError
    )
  }

  // Either subscribe to status updates, or return an observable with
  // the current status and all subsequent status changes.
  horizon.status = subscribeOrObservable(hzSocket.status)

  // Convenience method for finding out when disconnected
  horizon.onDisconnected = subscribeOrObservable(
    hzSocket.status.filter(x => x.type === 'disconnected'))

  // Convenience method for finding out when ready
  horizon.onReady = subscribeOrObservable(
    hzSocket.status.filter(x => x.type === 'ready'))

  // Convenience method for finding out when an error occurs
  horizon.onSocketError = subscribeOrObservable(
    hzSocket.status.filter(x => x.type === 'error'))

  horizon.utensils = {
    sendRequest,
    tokenStorage,
    handshake: hzSocket.handshake,
    horizonSocket: hzSocket,
  }
  Object.freeze(horizon.utensils)

  horizon._authMethods = null
  horizon._root = `http${(secure) ? 's' : ''}://${host}`
  horizon._horizonPath = `${horizon._root}/${path}`
  horizon.authEndpoint = authEndpoint
  horizon.hasAuthToken = tokenStorage.hasAuthToken.bind(tokenStorage)
  horizon.aggregate = aggregate
  horizon.model = model

  return horizon

  // Sends a horizon protocol request to the server, and pulls the data
  // portion of the response out.
  function sendRequest(type, options) {
    // Both remove and removeAll use the type 'remove' in the protocol
    const normalizedType = type === 'removeAll' ? 'remove' : type
    return hzSocket
      .hzRequest({ type: normalizedType, options }) // send the raw request
      .takeWhile(resp => resp.state !== 'complete')
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

Horizon.Socket = HorizonSocket
Horizon.clearAuthTokens = clearAuthTokens

module.exports = Horizon
