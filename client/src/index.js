import { BehaviorSubject } from 'rxjs/BehaviorSubject'

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

export default function Horizon({
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

  // This is the object returned by the Horizon function. It's a
  // function so we can construct a collection simply by calling it
  // like horizon('my_collection')
  function horizon(name) {
    return new Collection(sendRequest, name, lazyWrites)
  }
  const self = horizon  // For clarity below

  const sockets = createSockets()


  // We need to filter out null/undefined handshakes in several places
  const filteredHandshake = sockets
          .switchMap(socket => socket.handshake)
          .filter(handshake => handshake != null)

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

  self.currentUser = () =>
    new UserDataTerm(
      self,
      filteredHandshake,
      self._hzSocket
    )

  self.disconnect = () => {
    self._hzSocket.complete()
  }

  // Dummy subscription to force it to connect to the
  // server. Optionally provide an error handling function if the
  // socket experiences an error.
  // Note: Users of the Observable interface shouldn't need this
  self.connect = (
    onError = err => { console.error(`Received an error: ${err}`) }
  ) => {
    return sockets.switch().take(1).subscribe({
      error: e => {
        onError(e)
      },
    })
  }

  const status = createStatus()

  // Either subscribe to status updates, or return an observable with
  // the current status and all subsequent status changes.
  self.status = subscribeOrObservable(status)

  // Convenience method for finding out when disconnected
  self.onDisconnected = subscribeOrObservable(
    status.filter(x => x.type === 'disconnected'))

  // Convenience method for finding out when ready
  self.onReady = subscribeOrObservable(
    status.filter(x => x.type === 'ready'))

  // Convenience method for finding out when an error occurs
  self.onSocketError = subscribeOrObservable(
    status.filter(x => x.type === 'error'))

  self.utensils = {
    sendRequest,
    tokenStorage,
  }
  Object.freeze(self.utensils)

  self._authMethods = null
  self._root = `http${(secure) ? 's' : ''}://${host}`
  self._horizonPath = `${self._root}/${path}`

  self.authEndpoint = authEndpoint
  self.hasAuthToken = tokenStorage.hasAuthToken.bind(tokenStorage)
  self.aggregate = aggregate
  self.model = model

  return self

  // Sends a horizon protocol request to the server, and pulls the data
  // portion of the response out.
  function sendRequest(type, options) {
    // Both remove and removeAll use the type 'remove' in the protocol
    const normalizedType = type === 'removeAll' ? 'remove' : type
    return sockets.switchMap(socket => socket
      .hzRequest({ type: normalizedType, options }) // send the raw request
      .takeWhile(resp => resp.state !== 'complete'))
  }

  function createSockets() {
    const socketsSubject = new BehaviorSubject()

    socketsSubject.next(new HorizonSocket({
      url,
      handshakeMaker: tokenStorage.handshake.bind(tokenStorage),
      keepalive,
      WebSocketCtor,
      websocket,
    }))

    return socketsSubject
  }

  function createStatus() {
    // Since the underlying socket is going to be swapped out, we need
    // to create a wrapper BehaviorSubject that is subscribed in turn
    // to each subsequent HorizonSocket that is created.
    const statusSubject = new BehaviorSubject()
    sockets.switchMap(socket => socket.status).subscribe(statusSubject)
    return statusSubject
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
