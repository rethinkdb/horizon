const queryParse = require('./util/query-parse')
const Rx = require('rx')
require('rx-dom-ajax') // add Rx.DOM.ajax methods

/** @this Horizon **/
function authEndpoint(name) {
  const endpointForName = methods => {
    if (methods.hasOwnProperty(name)) {
      return methods[name]
    } else {
      throw new Error(`Unconfigured auth type: ${name}`)
    }
  }
  if (!this._authMethods) {
    console.log('No auth methods, have to fetch')
    return Rx.DOM.getJSON(`${this._horizonPath}/auth_methods`)
      .do(authMethods => {
        this._authMethods = authMethods
      }).map(endpointForName)
  } else {
    return Rx.Observable.just(this._authMethods).map(endpointForName)
  }
}

// Simple shim to make a Map look like local/session storage
class FakeStorage {
  constructor() { this.map = new Map() }
  setItem(a, b) { return this.map.set(a, b) }
  getItem(a) { return this.map.get(a) }
  removeItem(a) { return this.map.delete(a) }
}

function getStorage() {
  if (window.localStorage === undefined) {
    return new FakeStorage()
  }
  try {
    window.localStorage.setItem('$$fake', 1)
    window.localStorage.removeItem('$$fake')
    return window.localStorage
  } catch (error) {
    if (window.sessionStorage === undefined) {
      return new FakeStorage()
    } else {
      return window.sessionStorage
    }
  }
}

class TokenStorage {
  constructor(authType = 'token') {
    this._storage = getStorage()
    this._authType = authType
    this._withRegistry = modify => {
      const rawRegistry = this._storage.getItem('horizon-jwt')
      const oldRegistry = rawRegistry ? JSON.parse(rawRegistry) : {}
      const newRegistry = modify(oldRegistry)
      if (newRegistry != null) {
        return this._storage.setItem('horizon-jwt', JSON.stringify(newRegistry))
      }
      return null
    }
  }

  set(name, jwt) {
    return this._withRegistry(reg => { reg[name] = jwt })
  }

  get(name) {
    let val
    this._withRegistry(reg => { val = reg[name] })
    return val
  }

  remove(name) {
    return this._withRegistry(reg => { delete reg[name] })
  }

  // Remove all jwt tokens from localStorage
  clear() {
    return this._withRegistry(() => ({}))
  }

  setAuthFromQueryParams(tokenStorage) {
    const parsed = queryParse(window.location.search)
    if (parsed.horizon_auth != null) {
      tokenStorage.set('oauth', parsed.horizon_token)
    }
  }

  // Handshake types are implemented here
  handshake() {
    switch (this._authType) {
    case 'unauthenticated':
    case 'anonymous': {
      // If we have anonymous credentials, we should send them rather
      // than requesting new ones
      const token = this.get(this._authType)
      if (token != null) {
        return { method: 'token', token }
      } else {
        return { method: this._authType }
      }
    }
    case 'token': {
      const oauthTk = this.get('oauth')
      if (oauthTk) {
        return { method: 'token', token: oauthTk }
      } else {
        throw new Error(
          'Attempting to authenticate with a token, but no token is present')
      }
    }
    default:
      throw new Error(`Unrecognized auth type: ${this._authType}`)
    }
  }

  maybeSaveToken(authType, token) {
    if (authType === 'anonymous' || authType === 'unauthenticated') {
      this._withRegistry(reg => {
        if (reg[authType] !== token) {
          reg[authType] = token
        }
        return reg
      })
    }
  }

  // Whether there is an auth token for the provided authType
  hasAuthToken() {
    console.log(`Looking for a ${this._authType} token`)
    return Boolean(this.get(this._authType))
  }
}

function clearAuthTokens() {
  const storage = getStorage().removeItem('horizon-jwt')
  getStorage().removeItem('horizon-jwt')
}

module.exports = {
  authEndpoint,
  TokenStorage,
  clearAuthTokens,
}
