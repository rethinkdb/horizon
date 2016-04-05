const queryParse = require('./util/query-parse')
const Rx = require('rx')
require('rx-dom-ajax') // add Rx.DOM.ajax methods

const HORIZON_JWT = 'horizon-jwt'

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
    return Rx.DOM.getJSON(`${this._horizonHost}/${this._horizonPath}/auth_methods`)
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
  constructor(authType = 'unauthenticated') {
    this._storage = getStorage()
    this._authType = authType
  }

  set(jwt) {
    return this._storage.setItem(HORIZON_JWT, jwt)
  }

  get() {
    return this._storage.getItem(HORIZON_JWT)
  }

  remove() {
    return this._storage.removeItem(HORIZON_JWT)
  }

  setAuthFromQueryParams() {
    const parsed = queryParse(window.location.search)
    if (parsed.horizon_auth != null) {
      this.set(parsed.horizon_auth)
    }
  }

  // Handshake types are implemented here
  handshake() {
    // If we have a token, we should send it rather than requesting a
    // new one
    const token = this.get()
    if (token != null) {
      return { method: 'token', token }
    } else if (this._authType === 'token') {
      throw new Error(
        'Attempting to authenticate with a token, but no token is present')
    } else {
      return { method: this._authType }
    }
  }

  // Whether there is an auth token for the provided authType
  hasAuthToken() {
    return Boolean(this.get())
  }
}

function clearAuthTokens() {
  return getStorage().removeItem(HORIZON_JWT)
}

module.exports = {
  authEndpoint,
  TokenStorage,
  clearAuthTokens,
}
