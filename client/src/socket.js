import { AsyncSubject } from 'rxjs/AsyncSubject'
import { Subject } from 'rxjs/Subject'
import { BehaviorSubject } from 'rxjs/BehaviorSubject'
import { WebSocketSubject } from 'rxjs/observable/dom/WebSocketSubject'
import { Observable } from 'rxjs/Observable'
import { Subscription } from 'rxjs/Subscription'
import 'rxjs/add/observable/merge'
import 'rxjs/add/observable/timer'
import 'rxjs/add/operator/filter'
import 'rxjs/add/operator/share'
import 'rxjs/add/operator/ignoreElements'
import 'rxjs/add/operator/concat'
import 'rxjs/add/operator/takeWhile'
import 'rxjs/add/operator/publish'
import jsonpatch from 'jsonpatch'

import { serialize, deserialize } from './serialization.js'

const PROTOCOL_VERSION = 'rethinkdb-horizon-v1'

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
    return deserialize(JSON.parse(e.data))
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
    handshakeMaker, // function that returns handshake to emit
    keepalive = 60,   // seconds between keepalive messages
    WebSocketCtor = WebSocket,    // optionally provide a WebSocket constructor
  } = {}) {
    super({
      url,
      protocol: PROTOCOL_VERSION,
      WebSocketCtor,
      openObserver: {
        next: () => {
          this.subscribe({
            next: (response) => this.handleResponse(response),
            error: (err) => {
              console.log(`Socket error: ${JSON.stringify(err)}`)
              this.status.next(STATUS_ERROR)
            },
          })
          this.sendHandshake(handshakeMaker)
        },
      },
      closingObserver: {
        next: () => {
          this.handshake = new AsyncSubject()
          if (this._handshakeSub) {
            this._handshakeSub.unsubscribe()
            this._handshakeSub = null
          }
          this.status.next(STATUS_DISCONNECTED)
        },
      },
    })

    // This is used to emit status changes that others can hook into.
    this.status = new BehaviorSubject(STATUS_UNCONNECTED)

    // Completes or errors based on handshake success. Buffers
    // handshake response for later subscribers (like a Promise)
    this.handshake = new AsyncSubject()
    this._handshakeSub = null

    this.keepalive = Observable
      .timer(keepalive * 1000, keepalive * 1000)
      .map((n) => this.makeRequest(null, 'keepalive').subscribe())
      .publish()
    this.requestCounter = 0
    // A map from requestId to an object with metadata about the
    // request. Eventually, this should allow re-sending requests when
    // reconnecting.
    this.requests = new Map()
  }

  sendHandshake(handshakeMaker) {
    this._handshakeSub = this.makeRequest(handshakeMaker(), 'handshake')
      .subscribe({
        next: (n) => {
          if (n.error) {
            this.status.next(STATUS_ERROR)
            this.handshake.error(new ProtocolError(n.error, n.errorCode))
          } else {
            this.status.next(STATUS_READY)
            this.handshake.next(n)
            this.handshake.complete()
          }
        },
        error: (e) => {
          this.status.next(STATUS_ERROR)
          this.handshake.error(e)
        },
      })

    // Start the keepalive and make sure it's
    // killed when the handshake is cleaned up
    this._handshakeSub.add(this.keepalive.connect())
  }

  // Incorporates shared logic between the inital handshake request and
  // all subsequent requests.
  // * Generates a request id and filters by it
  // * Send `end_subscription` when observable is unsubscribed
  makeRequest(options, type) {
    const requestId = this.requestCounter++
    const req = {
      message: {requestId},
      data: {},
      subject: new Subject(),
    }

    if (options) { req.message.options = options }
    if (type) { req.message.type = type }

    this.requests.set(requestId, req)
    this.next(req.message)
    return req.subject
  }

  cleanupRequest(requestId) {
    const req = this.requests.get(requestId)
    if (req) {
      this.requests.delete(requestId)
      req.subject.complete()
    }
  }

  handleResponse(message) {
    const req = this.requests.get(message.requestId)
    if (req) {
      req.subject.next(message)
      if (message.complete) {
        this.cleanupRequest(message.requestId)
      }
    }
  }

  // Wrapper around the makeRequest with the following additional
  // features we need for horizon's protocol:
  // * Sends handshake on subscription if it hasn't happened already
  // * Wait for the handshake to complete before sending the request
  // * Errors when a document with an `error` field is received
  // * Completes when `state: complete` is received
  // * Reference counts subscriptions
  hzRequest(options) {
    let req
    return this.handshake.ignoreElements()
      .concat(() => (req = this.makeRequest(options)))
      .concatMap((response) => {
        if (response.error) {
          throw new Error(response.error)
        }

        if (response.patch) {
          // TODO: are there any cases where it is a problem that we
          // have already 'deserialized' the data before applying the patch?
          req.data = jsonpatch.apply_patch(req.data, response.patch)
        }
        if (Boolean(req.data.synced)) {
          switch (req.data.type) {
          case 'value':
            return [req.data.val]
          case 'set':
            return [Object.values(data.val)]
          default:
            throw new Error(`Unrecognized data type: ${data.type}.`)
          }
        }
        return []
      })
      /* or...
      .map((response) => {
        if (response.error) {
          throw new Error(response.error)
        }

        if (response.patch) {
          req.data = jsonpatch.apply_patch(req.data, response.patch)
        }
        return req.data
      })
      .filter((data) => Boolean(data.synced))
      .map((data) => {
        if (data.type === 'value') { return data.val }
        if (data.type === 'set') { return Object.values(data.val) }
        throw new Error(`Unrecognized data type: ${data.type}.`)
      })
      */
      .share()
  }
}
