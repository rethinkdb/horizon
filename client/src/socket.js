import { AsyncSubject } from 'rxjs/AsyncSubject'
import { BehaviorSubject } from 'rxjs/BehaviorSubject'
import { Subject } from 'rxjs/Subject'
import { WebSocketSubject } from 'rxjs/observable/dom/WebSocketSubject'
import { Observable } from 'rxjs/Observable'
import 'rxjs/add/observable/merge'
import 'rxjs/add/operator/filter'
import 'rxjs/add/operator/share'

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
    return deserialize(e)
  }

  // We're overriding the next defined in AnonymousSubject so we
  // always serialize the value. When this is called a message will be
  // sent over the socket to the server.
  next(value) {
    super.next(JSON.stringify(serialize(value)))
  }

  constructor({
    url,              // Full url to connect to
    handshakeMessage, // function that returns handshake to emit
    keepalive = 60,   // seconds between keepalive messages
    socket,           // optionally provide a WebSocket to use
    WebSocketCtor,    // optionally provide a WebSocket constructor
  } = {}) {
    super({
      url,
      protocol: PROTOCOL_VERSION,
      socket,
      WebSocketCtor,
    })
    // Completes or errors based on handshake success. Buffers
    // handshake response for later subscribers (like a Promise)
    this.handshake = new AsyncSubject()
    this.handshakeMessage = handshakeMessage
    this.handshakeSub = null

    // This is used to emit status changes that others can hook into.
    this.status = new BehaviorSubject(STATUS_UNCONNECTED)
    // Keep track of subscribers so we's can decide when to
    // unsubscribe.
    this.activeSubscribers = 0
    this.requestCounter = 0
    this.keepalive = keepalive
    // A map from request_ids to an object with metadata about the
    // request. Eventually, this should allow re-sending requests when
    // reconnecting.
    this.activeRequests = new Map()
  }

  deactivateRequest(requestId) {
    if (this.activeRequests.delete(requestId) &&
        this.activeRequests.size === 0) {
      // Unsubscribe handshake and socket
      this.unsubscribe()
    }
  }

  activateRequest(requestId, request) {
    this.activeRequests.set(requestId, { request })
    if (this.activeRequests.size === 1) {
      this.sendHandshake()
    }
  }

  // This is a trimmed-down version of multiplex that only listens for
  // the handshake requestId, and doesn't send `end_subscription`
  // messages etc that aren't needed. It also starts the keepalive
  // observable and cleans up after it when the handshake is cleaned
  // up.
  sendHandshake() {
    const requestId = this.requestCounter++
    const handshake = this.handshake
    const status = this.status

    const request = Object.assign(
      { request_id: requestId }, this.handshakeMessage)

    const subMsg = () => {
      this.activeRequests.set(requestId, { request })
      return request
    }

    const unsubMsg = () => {
      this.activeRequests.delete(requestId)
    }

    const filter = resp => resp.request_id === requestId

    this.handshakeSub = super.multiplex(subMsg, unsubMsg, filter).subscribe({
      next: resp => {
        // This is a per-query error
        if (resp.error) {
          handshake.error(new ProtocolError(resp.error, resp.error_code))
          status.next(STATUS_ERROR)
        } else {
          handshake.next(resp)
          handshake.complete()
          status.next(STATUS_READY)
        }
      },
      error: err => {
        handshake.error(err)
        status.next(STATUS_ERROR)
      },
      complete: () => handshake.complete(),
    })
    // Start the keepalive. While it has a request_id, we don't
    // actually care about responses.
    const keepAliveSub = Observable
            .timer(this.keepalive * 1000, this.keepalive * 1000)
            .map(n => ({
              type: 'keepalive',
              n,
              request_id: this.requestCounter++,
            })).subscribe(ka => this.next(ka))
    // Make sure keepalive is killed when the handshake is cleaned up
    this.handshakeSub.add(keepAliveSub)
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
    return new Observable(subscriber => {
      const requestId = this.requestCounter++
      const request = Object.assign({ request_id: requestId }, rawRequest)

      const subMsg = () => {
        this.activateRequest(requestId, request)
        return request
      }

      const unsubMsg = () => {
        this.deactivateRequest(requestId)
        return { request_id: requestId, type: 'end_subscription' }
      }

      // Ensure the handshake is complete successfully before sending
      // our request. this.handshake is an AsyncSubject which acts
      // like a Promise and caches its value.
      this.handshake.subscribe({
        error: err => subscriber.error(err),
        complete: () => this.next(request), // send request on
        // handshake completion
      })

      this.handshake.ignoreElements().concat(
        super.multiplex(subMsg, unsubMsg, resp => resp.request_id === requestId)
      ).subscribe({
        next: resp => {
          if (resp.error !== undefined) {
            // This is an error just for this request, not the
            // entire connection
            subscriber.error(
              new ProtocolError(resp.error, resp.error_code))
          } else if (resp.data !== undefined) {
            // Forward on the response if there's a data field
            subscriber.next(resp)
          }
          if (resp.state === 'synced') {
            // Create a little dummy object for sync notifications
            subscriber.next({
              type: 'state',
              state: 'synced',
            })
          } else if (resp.state === 'complete') {
            subscriber.complete()
          }
        },
        error: err => subscriber.error(err),
        complete: () => subscriber.complete(),
      })
    })
  }

  unsubscribe() {
    this.handshakeSub.unsubscribe()
    super.unsubscribe()
    this.status.next(STATUS_DISCONNECTED)
  }
}
