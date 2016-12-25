import 'rxjs/add/observable/of'
import 'rxjs/add/observable/from'
import 'rxjs/add/operator/catch'
import 'rxjs/add/operator/concatMap'
import 'rxjs/add/operator/map'
import 'rxjs/add/operator/filter'

import { TermBase, addOption } from './ast'
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
  WebSocketCtor = WebSocket,
} = {}) {
  // If we're in a redirection from OAuth, store the auth token for
  // this user in localStorage.

  const tokenStorage = new TokenStorage({ authType, path })
  tokenStorage.setAuthFromQueryParams()

  const url = `ws${secure ? 's' : ''}:\/\/${host}\/${path}`
  const socket = new HorizonSocket({
    url,
    tokenStorage,
    keepalive,
    WebSocketCtor,
  })

  const request = new TermBase({}, sendRequest)

  // This is the object returned by the Horizon function. It's a
  // function so we can construct a collection simply by calling it
  // like horizon('my_collection')
  function horizon(name) {
    return request.collection(name);
  }

  // Convenience function to access the current user's row
  // TODO: this is a terrible, terrible hack
  horizon.currentUser = () => {
    function makeRequest(type) {
      // User ID won't be available until we've connected
      const userId = { toJSON: () => socket.handshake.value.id };
      return socket.handshake.last().map((handshake) => {
        if (handshake.id === null) {
          throw new Error('Unauthenticated users have no user document.');
        }
      }).ignoreElements().concat(request.collection('users').find({id: userId})[type]());
    }
    return {
      fetch: () => makeRequest('fetch'),
      watch: () => makeRequest('watch'),
    };
  }

  horizon.request = request;

  // Force the socket to connect without any pending requests
  // Optionally provide an error handling function if the socket experiences an error.
  // Note: Users of the Observable interface shouldn't need this
  horizon.connect = (onError = (err) => console.error(`Horizon socket error: ${err}`)) =>
    socket.connect(onError)

  // Note: this only works as long as there are no extra observers on the socket
  horizon.disconnect = () => socket.disconnect()

  // RSI: remove this - for debugging purposes
  horizon.socket = socket;

  // Either subscribe to status updates, or return an observable with
  // the current status and all subsequent status changes.
  horizon.status = subscribeOrObservable(socket.status)

  // Convenience method for finding out when disconnected
  horizon.onDisconnected = subscribeOrObservable(
    socket.status.filter(x => x.type === 'disconnected'))

  // Convenience method for finding out when ready
  horizon.onReady = subscribeOrObservable(
    socket.status.filter(x => x.type === 'ready'))

  // Convenience method for finding out when an error occurs
  horizon.onSocketError = subscribeOrObservable(
    socket.status.filter(x => x.type === 'error'))

  horizon.utensils = {
    sendRequest,
    tokenStorage,
    handshake: () => socket.handshake,
  }
  Object.freeze(horizon.utensils)

  horizon._authMethods = null
  horizon._root = `http${(secure) ? 's' : ''}://${host}`
  horizon._horizonPath = `${horizon._root}/${path}`
  horizon.authEndpoint = authEndpoint
  horizon.hasAuthToken = () => tokenStorage.hasAuthToken()
  horizon.aggregate = aggregate
  horizon.model = model

  return horizon

  function sendRequest(options) {
    return socket.hzRequest(options)
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
Horizon.addOption = addOption

module.exports = Horizon
