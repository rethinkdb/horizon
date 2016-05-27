import { Observable } from 'rxjs/Observable'
import { of } from 'rxjs/observable/of'
import { from } from 'rxjs/observable/from'
import { _catch } from 'rxjs/operator/catch'
import { concatMap } from 'rxjs/operator/concatMap'
import { map } from 'rxjs/operator/map'
import { filter } from 'rxjs/operator/filter'

import { Collection } from './ast'
import { HorizonSocket } from './socket'
import { log, logError, enableLogging } from './logging'
import { authEndpoint, TokenStorage, clearAuthTokens } from './auth'

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
} = {}) {
    // If we're in a redirection from OAuth, store the auth token for
    // this user in localStorage.
    const tokenStorage = new TokenStorage({ authType, path })
    tokenStorage.setAuthFromQueryParams()

    const socket = new HorizonSocket(
        host, secure, path, tokenStorage.handshake.bind(tokenStorage))

    // Store whatever token we get back from the server when we get a
    // handshake response
    socket.handshake.subscribe({
        next(handshake) {
            if (authType !== 'unauthenticated') {
                tokenStorage.set(handshake.token)
            }
        },
        error(err) {
            if (/JsonWebTokenError/.test(err.message)) {
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

    horizon.currentUser = () => new UserDataTerm(horizon, socket.handshake)

    horizon.disconnect = () => {
        socket.complete()
    }

    // Dummy subscription to force it to connect to the
    // server. Optionally provide an error handling function if the
    // socket experiences an error.
    // Note: Users of the Observable interface shouldn't need this
    horizon.connect = (
        onError = err => { console.error(`Received an error: ${err}`) }
    ) => {
        socket.subscribe(
            () => { },
            onError
        )
    }

    // Either subscribe to status updates, or return an observable with
    // the current status and all subsequent status changes.
    horizon.status = subscribeOrObservable(socket.status)

    // Convenience method for finding out when disconnected
    horizon.onDisconnected = subscribeOrObservable(
        socket.status::filter(x => x.type === 'disconnected'))

    // Convenience method for finding out when ready
    horizon.onReady = subscribeOrObservable(
        socket.status::filter(x => x.type === 'ready'))

    // Convenience method for finding out when an error occurs
    horizon.onSocketError = subscribeOrObservable(
        socket.status::filter(x => x.type === 'error'))

    horizon.utensils = {
        sendRequest,
        tokenStorage,
    }
    Object.freeze(horizon.utensils)

    horizon._authMethods = null
    horizon._horizonPath = path
    horizon.authEndpoint = authEndpoint
    horizon.hasAuthToken = ::tokenStorage.hasAuthToken

    return horizon

    // Sends a horizon protocol request to the server, and pulls the data
    // portion of the response out.
    function sendRequest(type, options) {
        // Both remove and removeAll use the type 'remove' in the protocol
        const normalizedType = type === 'removeAll' ? 'remove' : type
        return socket
            .makeRequest({ type: normalizedType, options }) // send the raw request
      ::concatMap(resp => {
            // unroll arrays being returned
            if (resp.data) {
                return Observable::from(resp.data)
            } else {
                // Still need to emit a document even if we have no new data
                return Observable::from([{ state: resp.state, type: resp.type }])
            }
        })
      ::_catch(e => Observable.create(subscriber => {
            subscriber.error(e)
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

class UserDataTerm {
    constructor(hz, baseObservable) {
        this._hz = hz
        this._baseObservable = baseObservable::map(handshake => handshake.id)
    }

    _query(userId) {
        return this._hz('users').find(userId)
    }

    fetch() {
        return this._baseObservable::concatMap(userId => {
            if (userId === null) {
                return Observable::of({})
            } else {
                return this._query(userId).fetch()
            }
        })
    }

    watch(...args) {
        return this._baseObservable::concatMap(userId => {
            if (userId === null) {
                return Observable::of({})
            } else {
                return this._query(userId).watch(...args)
            }
        })
    }
}


Horizon.log = log
Horizon.logError = logError
Horizon.enableLogging = enableLogging
Horizon.Socket = HorizonSocket
Horizon.clearAuthTokens = clearAuthTokens

module.exports = Horizon
