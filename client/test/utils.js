import { Observable } from 'rxjs/Observable'
import 'rxjs/add/observable/empty'
import 'rxjs/add/operator/toArray'
import 'rxjs/add/operator/do'
import 'rxjs/add/operator/mergeMap'
import 'rxjs/add/operator/mergeMapTo'
import 'rxjs/add/operator/take'
import 'rxjs/add/operator/ignoreElements'

import { PROTOCOL_VERSION } from '../src/socket'

export function removeAllDataObs(collection) {
  // Read all elements from the collection
  return collection.fetch() // all documents in the collection
    .do()
    .mergeMap(docs => collection.removeAll(docs))
    .mergeMapTo(collection.fetch())
    .do(remaining => assert.deepEqual([], remaining))
}

export function removeAllData(collection, done) {
  removeAllDataObs(collection).subscribe(doneObserver(done))
}

// Used to subscribe to observables and call done appropriately
function doneObserver(done) {
  return {
    next() {},
    error(err = new Error()) { done(err) },
    complete() { done() },
  }
}

// Used to subscribe to observables when an error is expected
function doneErrorObserver(done, regex) {
  return {
    next() {},
    error(err) {
      this.finished = true
      if (regex && regex.test(err.message)) {
        done()
      } else {
        done(err)
      }
    },
    complete() {
      if (!this.finished) {
        done(new Error('Unexpectedly completed'))
      }
    },
  }
}

// Used to check for stuff that should throw an exception, rather than
// erroring the observable stream
export function assertThrows(message, callback) {
  const f = done => {
    try {
      callback()
      done(new Error("Didn't throw an exception"))
    } catch (err) {
      if (err.message === message) {
        done()
      } else {
        done(new Error('Threw the wrong exception. ' +
                       `Expected "${message}", got "${err.message}"`))
      }
    }
  }
  f.toString = () => `assertThrows(\n'${message}',\n  ${callback}\n)`
  return f
}

export function assertCompletes(observable) {
  const f = done => observable().subscribe(doneObserver(done))
  f.toString = () => `assertCompletes(\n(${observable}\n)`
  return f
}

export function assertErrors(observable, regex) {
  const f = done => observable().subscribe(doneErrorObserver(done, regex))
  f.toString = () => observable.toString()
  return f
}

// Useful for asynchronously interleaving server actions with a
// changefeed and testing the changes are as expected.
//
// Takes a sequence of actions and a changefeed query. Executes the
// next action every time a value comes in over the feed. Asserts that
// the expected values are returned from the final observable. The
// changefeed is automatically limited to the length of the expected
// array. Accepts a `debug` argument that receives every element in
// the changefeed
export function observableInterleave(options) {
  const query = options.query
  const operations = options.operations
  const expected = options.expected
  const equality = options.equality || compareWithoutVersion
  const debug = options.debug || (() => {})
  const values = []
  return query
    .take(expected.length)
    .do(debug)
    .mergeMap((val, i) => {
      values.push(val)
      if (i < operations.length) {
        return operations[i].ignoreElements()
      } else {
        return Observable.empty()
      }
    })
    .do({ complete() { equality(expected, values) } })
}

const withoutVersion = function withoutVersion(value) {
  if (Array.isArray(value)) {
    const modified = [ ]
    for (const item of value) {
      modified.push(withoutVersion(item))
    }
    return modified
  } else if (typeof value === 'object') {
    const modified = Object.assign({ }, value)
    delete modified['$hz_v$']
    return modified
  } else {
    return value
  }
}

// Compare write results - ignoring the new version field ($hz_v$)
export function compareWithoutVersion(actual, expected, message) {
  return assert.deepEqual(withoutVersion(actual),
                          withoutVersion(expected),
                          message)
}

export function compareSetsWithoutVersion(actual, expected, message) {
  return assert.sameDeepMembers(withoutVersion(actual),
                                withoutVersion(expected),
                                message)
}

function defaultCallback(name, actions) {
  return ev => {
    actions.push([ `default_${name}_called` ])
  }
}

function tryCatchCallback(name, actions, callback) {
  return ev => {
    try {
      actions.push([ `user_defined_${name}_called` ])
      return callback(ev)
    } catch (err) {
      actions.push([ `${name}_threw_exc`, err ])
      throw err
    }
  }
}

export class MockWebSocket {
  // The goal of this mock socket is to get everything to basically
  // run as synchronously as possible so debugging can be reasonably
  // be done with stack traces.
  constructor(mockServer) {
    this.readyState = 0  // connecting
    this.url = 'ws://localhost/mockSocket'
    this.protocol = PROTOCOL_VERSION
    this.actions = [ [ 'opening' ] ]
    this.mockServer = mockServer // function(actionType, options) -> response
    this._onopen = defaultCallback('onopen', this.actions)
    this._onclose = defaultCallback('onclose', this.actions)
    this._onmessage = defaultCallback('onmessage', this.actions)
    this._onerror = defaultCallback('onerror', this.actions)
    // onopen needs to be called in a microtask, so that callbacks set
    // after the constructor is called are in place
    Promise.resolve().then(() => {
      this.readyState = 1 // connected
      this.actions.push([ 'open' ])
      this.onopen({ type: 'open' })
    })
  }
  send(msg) {
    this.actions.push([ 'client_send', msg ])
    const response = this.fakeServer(msg)
    if (response.type === 'error') {
      this.actions.push([ 'server_error', response.data ])
      this.onerror({ type: 'error' }) // Websocket protocol not super helpful..
    } else if (response.type === 'message') {
      this.actions.push([ 'server_message', response.data ])
      this.onmessage({ type: 'message', data: JSON.stringify(response.data) })
    } else if (response.type === 'close') {
      this.readyState = 3 // closed
      this.actions.push([ 'server_close', response.data ])
      this.onclose({
        type: 'close',
        code: response.data.code,
        reason: response.data.msg,
        wasClean: response.data.code === 1000,
      })
    }
  }

  close(code = 1000, msg = 'Client closed websocket') {
    this.readyState = 3 // closed
    this.actions.push([ 'client_close', code, msg ])
    // We don't consult the mock server for this, just close client immediately
    this.onclose({
      type: 'close',
      code: code,
      reason: msg,
      wasClean: code === 1000,
    })
  }

  get onopen() {
    return this._onopen
  }
  set onopen(callback) {
    this.actions.push([ 'onopen_overridden' ])
    this._onopen = tryCatchCallback('onopen', this.actions, callback)
  }

  get onmessage() {
    return this._onmessage
  }
  set onmessage(callback) {
    this.actions.push([ 'onmessage_overridden' ])
    this._onmessage = tryCatchCallback('onmessage', this.actions, callback)
  }

  get onerror() {
    return this._onerror
  }
  set onerror(callback) {
    this.actions.push([ 'onerror_overridden' ])
    this._onerror = tryCatchCallback('onerror', this.actions, callback)
  }

  get onclose() {
    return this._onclose
  }
  set onclose(callback) {
    this.actions.push([ 'onclose_overridden' ])
    this._onclose = tryCatchCallback('onclose', this.actions, callback)
  }
}
