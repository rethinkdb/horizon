import { AsyncSubject } from 'rxjs/AsyncSubject'
import { BehaviorSubject } from 'rxjs/BehaviorSubject'
import { WebSocketSubject } from 'rxjs/observable/dom/WebSocketSubject'
import { Observable } from 'rxjs/Observable'
import 'rxjs/add/observable/merge'
import 'rxjs/add/observable/timer'
import 'rxjs/add/operator/filter'
import 'rxjs/add/operator/share'
import 'rxjs/add/operator/ignoreElements'
import 'rxjs/add/operator/concat'
import 'rxjs/add/operator/takeWhile'

import { serialize, deserialize } from './serialization.js'

const PROTOCOL_VERSION = 'rethinkdb-horizon-v0'

// Before connecting the first time
const STATUS_UNCONNECTED = { type: 'unconnected' }
// After the websocket is opened and handshake is completed
const STATUS_READY = { type: 'ready' }
// After unconnected, maybe before or after connected. Any socket level error
const STATUS_ERROR = { type: 'error' }
// Occurs when the socket closes
const STATUS_DISCONNECTED = { type: 'disconnected' }

class ProtocolError extends Error {
  constructor(msg, errorCode) {
    super(msg)
    this.errorCode = errorCode
  }
  toString() {
    return `${this.message} (Code: ${this.errorCode})`
  }
}


// Wraps native websockets with a Subject, which is both an Subscriber
// and an Observable (it is bi-directional after all!). This version
// is based on the rxjs.observable.dom.WebSocketSubject implementation.
export class HorizonSocket extends WebSocketSubject {

  // Deserializes a message from a string. Overrides the version
  // implemented in WebSocketSubject
  resultSelector(e) {
    const result = deserialize(JSON.parse(e.data))
    if (result.error !== undefined) {
      throw new ProtocolError(result.error, result.error_code)
    } else {
      return result
    }
  }

  // We're overriding the next defined in AnonymousSubject so we
  // always serialize the value. When this is called a message will be
  // sent over the socket to the server.
  next(value) {
    const request = JSON.stringify(serialize(value))
    super.next(request)
  }

  constructor({
    url,              // Full url to connect to
    handshakeMessage, // function that returns handshake to emit
    keepalive = 60,   // seconds between keepalive messages
    WebSocketCtor = WebSocket,    // optionally provide a WebSocket constructor
  } = {}) {
    super({
      url,
      protocol: PROTOCOL_VERSION,
      WebSocketCtor,
      openObserver: {
        next: () => this.sendHandshake(),
      },
      closeObserver: {
        next: () => {
          if (this._handshakeSub) {
            this._handshakeSub.unsubscribe()
          }
          this.status.next(STATUS_DISCONNECTED)
        },
      },
    })
    // Completes or errors based on handshake success. Buffers
    // handshake response for later subscribers (like a Promise)
    this.handshake = new AsyncSubject()
    this._handshakeMsg = handshakeMessage
    this._handshakeSub = null

    // This is used to emit status changes that others can hook into.
    this.status = new BehaviorSubject(STATUS_UNCONNECTED)
    // Keep track of subscribers so we's can decide when to
    // unsubscribe.
    this.requestCounter = 0
    this.keepalive = keepalive
    // A map from request_ids to an object with metadata about the
    // request. Eventually, this should allow re-sending requests when
    // reconnecting.
    this.activeRequests = new Map()
    this._output.subscribe({
      // This emits if the entire socket errors (usually due to
      // failure to connect)
      error: () => this.status.next(STATUS_ERROR),
    })
  }

  deactivateRequest(requestId) {
    this.activeRequests.delete(requestId)
  }

  activateRequest(requestId, request) {
    this.activeRequests.set(requestId, { request })
  }

  getRequestId() {
    return this.requestCounter++
  }

  // This is a trimmed-down version of multiplex that only listens for
  // the handshake requestId, and doesn't send `end_subscription`
  // messages etc that aren't needed. It also starts the keepalive
  // observable and cleans up after it when the handshake is cleaned
  // up.
  sendHandshake() {
    const requestId = this.getRequestId()
    const handshake = this.handshake
    const status = this.status

    const request = Object.assign({ request_id: requestId }, this._handshakeMsg)

    const subMsg = () => {
      this.activateRequest(requestId, request)
      return request
    }

    const unsubMsg = () => {
      this.deactivateRequest(requestId)
      return { request_id: requestId, type: 'end_subscription' }
    }

    const filter = resp => resp.request_id === requestId

    this._handshakeSub = super.multiplex(subMsg, unsubMsg, filter)
      .subscribe({
        next: n => {
          handshake.next(n)
          handshake.complete()
        },
        error: e => {
          handshake.error(e)
        },
      })

    // Emit our status events
    handshake.subscribe({
      next: () => status.next(STATUS_READY),
      error: () => status.next(STATUS_ERROR),
      // You'd think, since above we call handshake.complete(), this
      // would have a completion handler right? Wrong! The
      // AsyncSubject doesn't actually complete when you call
      // complete. That just forces it to emit its last value.
    })

    // Start the keepalive. While it has a request_id, we don't
    // actually care about responses.
    const keepAliveSub = Observable
            .timer(this.keepalive * 1000, this.keepalive * 1000)
            .map(n => ({
              type: 'keepalive',
              n,
              request_id: this.getRequestId(),
            })).subscribe(ka => this.next(ka))
    // Make sure keepalive is killed when the handshake is cleaned up
    this._handshakeSub.add(keepAliveSub)
  }

  // Wrapper around the superclass's version of multiplex. With the
  // following additional features we need for horizon's protocol:
  // * Generate a request id and filter by it
  // * Sends handshake on subscription if it hasn't happened already
  // * Wait for the handshake to complete before sending the request
  // * Errors when a document with an `error` field is received
  // * Completes when `state: complete` is received
  // * Emits `state: synced` as a separate document for easy filtering
  multiplex(rawRequest) {
    const requestId = this.getRequestId()
    const request = Object.assign({ request_id: requestId }, rawRequest)

    const subMsg = () => {
      this.activateRequest(requestId, request)
      return request
    }

    const unsubMsg = () => {
      this.deactivateRequest(requestId)
      return { request_id: requestId, type: 'end_subscription' }
    }

    return this.handshake.ignoreElements().concat(
      super.multiplex(subMsg, unsubMsg, resp => resp.request_id === requestId)
    ).concatMap(resp => {
      const data = []
      if (resp.data !== undefined) {
        data.push(resp)
      }
      if (resp.state === 'synced') {
        // Create a little dummy object for sync notifications
        data.push({
          type: 'state',
          state: 'synced',
        })
      }
      // This is emitted just so we can finish the observable for this
      // request in the `takeWhile` below. `takeWhile` doesn't emit
      // the first non-matching event, so this will never make it to
      // the client.
      if (resp.state === 'complete') {
        // This isn't an object event so that things will break loudly
        // if the logic changes
        data.push('complete')
      }
      return data
    }).takeWhile(resp => resp !== 'complete')
  }
}
