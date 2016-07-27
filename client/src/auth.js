import queryParse from './util/query-parse'
import { Observable } from 'rxjs/Observable'
import 'rxjs/add/operator/do'
import 'rxjs/add/operator/map'

const HORIZON_JWT = 'horizon-jwt'

/** @this Horizon **/
export function authEndpoint(name) {
  const endpointForName = methods => {
    if (methods.hasOwnProperty(name)) {
      return this._root + methods[name]
    } else {
      throw new Error(`Unconfigured auth type: ${name}`)
    }
  }
  if (!this._authMethods) {
    return Observable.ajax(`${this._horizonPath}/auth_methods`)
      .map(ajax => ajax.response)
      .do(authMethods => {
        this._authMethods = authMethods
      }).map(endpointForName)
  } else {
    return Observable.of(this._authMethods).map(endpointForName)
  }
}

// Simple shim to make a Map look like local/session storage
export class FakeStorage {
  constructor() { this._storage = new Map() }
  setItem(a, b) { return this._storage.set(a, b) }
  getItem(a) { return this._storage.get(a) }
  removeItem(a) { return this._storage.delete(a) }
}

function getStorage(storeLocally = true) {
  let storage
  try {
    if (!storeLocally ||
        typeof window !== 'object' ||
        window.localStorage === undefined) {
      storage = new FakeStorage()
    } else {
      // Mobile safari in private browsing has a localStorage, but it
      // has a size limit of 0
      window.localStorage.setItem('$$fake', 1)
      window.localStorage.removeItem('$$fake')
      storage = window.localStorage
    }
  } catch (error) {
    if (window.sessionStorage === undefined) {
      storage = new FakeStorage()
    } else {
      storage = window.sessionStorage
    }
  }
  return storage
}

export class TokenStorage {
  constructor({ authType = 'token',
                storage = getStorage(authType.storeLocally),
                path = 'horizon' } = {}) {
    this._storage = storage
    this._path = path
    if (typeof authType === 'string') {
      this._authType = authType
    } else {
      this._authType = 'token'
      this.set(authType.token)
    }
  }

  _getHash() {
    const val = this._storage.getItem(HORIZON_JWT)
    if (val == null) {
      return {}
    } else {
      return JSON.parse(val)
    }
  }

  _setHash(hash) {
    this._storage.setItem(HORIZON_JWT, JSON.stringify(hash))
  }

  set(jwt) {
    const current = this._getHash()
    current[this._path] = jwt
    this._setHash(current)
  }

  get() {
    return this._getHash()[this._path]
  }

  remove() {
    const current = this._getHash()
    delete current[this._path]
    this._setHash(current)
  }

  setAuthFromQueryParams() {
    const parsed = typeof window !== 'undefined' ?
            queryParse(window.location.search) : {}

    if (parsed.horizon_token != null) {
      this.set(parsed.horizon_token)
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

export function clearAuthTokens() {
  return getStorage().removeItem(HORIZON_JWT)
}
