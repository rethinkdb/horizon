import { AsyncSubject } from 'rxjs/AsyncSubject'
import { BehaviorSubject } from 'rxjs/BehaviorSubject'
import { Subject, AnonymousSubject } from 'rxjs/Subject'
import { WebSocketSubject } from 'rxjs/observable/dom/WebSocketSubject'
import { Observable } from 'rxjs/Observable'
import 'rxjs/add/observable/merge'
import 'rxjs/add/operator/filter'
import 'rxjs/add/operator/share'

import { serialize, deserialize } from './serialization.js'
import { log } from './logging.js'
import { WebSocket } from './shim.js'

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
class HorizonSocket extends WebSocketSubject {

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
    WebSocketCtor,    // optionally provide a WebSocket constructor to
                      // instantiate
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
    this.activeRequests.delete(requestId)
    if (this.activeRequests.size === 0) {
      // Unsubscribe handshake and socket
      this.unsubscribe()
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

    this.next(request)
    this.activeRequests.set(requestId, { request })
    this.handshakeSub = this.subscribe({
      next: incomingMsg => {
        // Check if we're getting a response to the handshake or not
        if (incomingMsg.request_id === requestId) {
          // This is a per-query error
          if (incomingMsg.error) {
            handshake.error(incomingMsg)
            status.next(STATUS_ERROR)
          } else {
            handshake.next(incomingMsg)
            handshake.complete()
            status.next(STATUS_READY)
          }
        }
      },
      error: err => {
        handshake.error(err)
        status.next(STATUS_ERROR)
      },
      complete: () => handshake.complete(),
    })
    this.handshakeSub.add(() => {
      this.activeRequests.delete(requestId)
    })
    // Start the keepalive. We don't do anything with the subscription
    // since we don't care about responses. All that matters is that
    // we can stop it later when needed. If an error to a keepalive
    // comes back, that's fine since either the socket is down (which
    // we'll find out about elsewhere) or the keepalive "failed" which
    // is a server bug, but indicates the socket is still alive, so
    // it's not really a failure.
    const keepAliveSub = Observable
            .timer(this.keepalive * 1000, this.keepalive * 1000)
            .map(n => ({ type: 'keepalive', n }))
            .subscribe()
    // Make sure keepalive is killed when the handshake is cleaned up
    this.handshakeSub.add(keepAliveSub)
  }

  multiplex(rawRequest) {
    const requestId = this.requestCounter++
    const request = Object.assign({ request_id: requestId }, rawRequest)
    this.activeRequests.set(requestId, { request })
    return new Observable(observer => {
      if (this.activeRequests.size === 1) {
        // send handshake only if we're the first request to be
        // subscribed to
        this.sendHandshake()
      }
      self.next(request)
      const subscription = this.subscribe({
        next: msg => {
          try {
            if (msg.request_id === requestId) {
              observer.next(msg)
            }
          } catch (e) {
            observer.error(e)
          }
        },
        error: err => observer.error(err),
        complete: () => {
          observer.complete()
          this.deactivateRequest(requestId)
        },
      })

      return () => {
        this.next({ request_id: requestId, type: 'end_subscription' })
        subscription.unsubscribe()
        this.deactivateRequest(requestId)
      }
    })
  }

  unsubscribe() {
    this.handshakeSub.unsubscribe()
    super.unsubscribe()
    this.status.next(STATUS_DISCONNECTED)
  }
}

export class HorizonSocket extends AnonymousSubject {
  constructor(host, secure, path, handshaker) {
    const hostString = `ws${secure ? 's' : ''}:\/\/${host}\/${path}`
    const msgBuffer = []
    let ws, handshakeDisp
    // Handshake is an asyncsubject because we want it to always cache
    // the last value it received, like a promise
    const handshake = new AsyncSubject()
    const statusSubject = new BehaviorSubject(STATUS_UNCONNECTED)

    const isOpen = () => Boolean(ws) && ws.readyState === WebSocket.OPEN

    // Serializes to a string before sending
    function wsSend(msg) {
      const stringMsg = JSON.stringify(serialize(msg))
      ws.send(stringMsg)
    }

    // This is the observable part of the Subject. It forwards events
    // from the underlying websocket
    const socketObservable = Observable.create(subscriber => {
      ws = new WebSocket(hostString, PROTOCOL_VERSION)

      ws.onerror = () => {
        // If the websocket experiences the error, we forward it through
        // to the observable. Unfortunately, the event we receive in
        // this callback doesn't tell us much of anything, so there's no
        // reason to forward it on and we just send a generic error.
        statusSubject.next(STATUS_ERROR)
        const errMsg = `Websocket ${hostString} experienced an error`
        subscriber.error(new Error(errMsg))
      }

      ws.onopen = () => {
        ws.onmessage = event => {
          const deserialized = deserialize(JSON.parse(event.data))
          log('Received', deserialized)
          subscriber.next(deserialized)
        }

        ws.onclose = e => {
          // This will happen if the socket is closed by the server If
          // .close is called from the client (see closeSocket), this
          // listener will be removed
          statusSubject.next(STATUS_DISCONNECTED)
          if (e.code !== 1000 || !e.wasClean) {
            subscriber.error(
              new Error(`Socket closed unexpectedly with code: ${e.code}`)
            )
          } else {
            subscriber.complete()
          }
        }

        // Send the handshake
        handshakeDisp = this.makeRequest(handshaker()).subscribe(
          x => {
            handshake.next(x)
            handshake.complete()
            statusSubject.next(STATUS_READY)
          },
          err => handshake.error(err),
          () => handshake.complete()
        )
        // Send any messages that have been buffered
        while (msgBuffer.length > 0) {
          const msg = msgBuffer.shift()
          log('Sending buffered:', msg)
          wsSend(msg)
        }
      }
      return () => {
        if (handshakeDisp) {
          handshakeDisp.unsubscribe()
        }
        // This is the "unsubscribe" method on the final Subject
        closeSocket(1000, '')
      }
    }).share() // This makes it a "hot" observable, and refCounts it
    // Note possible edge cases: the `share` operator is equivalent to
    // .multicast(() => new Subject()).refCount() // RxJS 5
    // .multicast(new Subject()).refCount() // RxJS 4

    // This is the Subscriber part of the Subject. How we can send stuff
    // over the websocket
    const socketSubscriber = {
      next(messageToSend) {
        // When next is called on this subscriber
        // Note: If we aren't ready, the message is silently dropped
        if (isOpen()) {
          log('Sending', messageToSend)
          wsSend(messageToSend) // wsSend serializes to a string
        } else {
          log('Buffering', messageToSend)
          msgBuffer.push(messageToSend)
        }
      },
      error(error) {
        // The subscriber is receiving an error. Better close the
        // websocket with an error
        if (!error.code) {
          throw new Error('no code specified. Be sure to pass ' +
                          '{ code: ###, reason: "" } to error()')
        }
        closeSocket(error.code, error.reason)
      },
      complete() {
        // complete for the subscriber here is equivalent to "close
        // this socket successfully (which is what code 1000 is)"
        closeSocket(1000, '')
      },
    }

    function closeSocket(code, reason) {
      statusSubject.next(STATUS_DISCONNECTED)
      if (!code) {
        ws.close() // successful close
      } else {
        ws.close(code, reason)
      }
      ws.onopen = null
      ws.onclose = null
      ws.onmessage = null
      ws.onerror = null
    }

    super(socketSubscriber, socketObservable)

    // Subscriptions will be the observable containing all
    // queries/writes/changefeed requests. Specifically, the documents
    // that initiate them, each one with a different request_id
    const subscriptions = new AnonymousSubject()
    // Unsubscriptions is similar, only it holds only requests to
    // close a particular request_id on the server. Currently we only
    // need these for changefeeds.
    const unsubscriptions = new AnonymousSubject()
    const outgoing = Observable.merge(subscriptions, unsubscriptions)
    // How many requests are outstanding
    let activeRequests = 0
    // Monotonically increasing counter for request_ids
    let requestCounter = 0
    // Unsubscriber for subscriptions/unsubscriptions
    let subDisp = null
    // Now that super has been called, we can add attributes to this
    this.handshake = handshake
    // Lets external users keep track of the current websocket status
    // without causing it to connect
    this.status = statusSubject

    const incrementActive = () => {
      if (++activeRequests === 1) {
        // We subscribe the socket itself to the subscription and
        // unsubscription requests. Since the socket is both an
        // observable and an subscriber. Here it's acting as an subscriber,
        // watching our requests.
        subDisp = outgoing.subscribe(this)
      }
    }

    // Decrement the number of active requests on the socket, and
    // close the socket if we're the last request
    const decrementActive = () => {
      if (--activeRequests === 0) {
        subDisp.unsubscribe()
      }
    }

    // This is used externally to send requests to the server
    this.makeRequest = rawRequest => Observable.create(reqSubscriber => {
      // Get a new request id
      const request_id = requestCounter++
      // Add the request id to the request and the unsubscribe request
      // if there is one
      rawRequest.request_id = request_id
      const unsubscribeRequest = { request_id, type: 'end_subscription' }
      // First, increment activeRequests and decide if we need to
      // connect to the socket
      incrementActive()

      // Now send the request to the server
      subscriptions.next(rawRequest)

      // Create an observable from the socket that filters by request_id
      const unsubscribeFilter = this
            .filter(x => x.request_id === request_id)
            .subscribe(
              resp => {
                // Need to faithfully end the stream if there is an error
                if (resp.error !== undefined) {
                  reqSubscriber.error(
                    new ProtocolError(resp.error, resp.error_code))
                } else if (resp.data !== undefined ||
                           resp.token !== undefined) {
                  try {
                    reqSubscriber.next(resp)
                  } catch (e) {
                  }
                }
                if (resp.state === 'synced') {
                  // Create a little dummy object for sync notifications
                  reqSubscriber.next({
                    type: 'state',
                    state: 'synced',
                  })
                } else if (resp.state === 'complete') {
                  reqSubscriber.complete()
                }
              },
              err => reqSubscriber.error(err),
              () => reqSubscriber.complete()
            )
      return () => {
        // Unsubscribe if necessary
        unsubscriptions.next(unsubscribeRequest)
        decrementActive()
        unsubscribeFilter.unsubscribe()
      }
    })
  }
}
