import { AsyncSubject } from 'rxjs/AsyncSubject'
import { BehaviorSubject } from 'rxjs/BehaviorSubject'
import { Subject } from 'rxjs/Subject'
import { Observable } from 'rxjs/Observable'
import { merge } from 'rxjs/observable/merge'
import { filter } from 'rxjs/operator/filter'
import { share } from 'rxjs/operator/share'

import { serialize, deserialize } from './serialization.js'
import { log } from './logging.js'
import socket from 'engine.io-client'

let transports

if (typeof window === 'undefined') {
  transports = [ 'websocket' ]
}

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
// and an Observable (it is bi-directional after all!). This
// implementation is adapted from Rx.DOM.fromWebSocket and
// RxSocketSubject by Ben Lesh, but it also deals with some simple
// protocol level things like serializing from/to JSON, routing
// request_ids, looking at the `state` field to decide when an
// observable is closed.
class HorizonSocket extends Subject {
  constructor(host, secure, path, handshaker) {
    const hostString = `ws${secure ? 's' : ''}://${host}`
    const msgBuffer = []
    let ws, handshakeDisp
    // Handshake is an asyncsubject because we want it to always cache
    // the last value it received, like a promise
    const handshake = new AsyncSubject()
    const statusSubject = new BehaviorSubject(STATUS_UNCONNECTED)

    const isOpen = () => Boolean(ws) && ws.readyState === 'open'

    // Serializes to a string before sending
    function wsSend(msg) {
      const stringMsg = JSON.stringify(serialize(msg))

      ws.send(stringMsg)
    }

    // This is the observable part of the Subject. It forwards events
    // from the underlying websocket
    const socketObservable = Observable.create(subscriber => {
      ws = socket(hostString, {
        protocol: PROTOCOL_VERSION,
        path: `/${path}`,
        transports
      })

      ws.on('error', () => {
        // If the websocket experiences the error, we forward it through
        // to the observable. Unfortunately, the event we receive in
        // this callback doesn't tell us much of anything, so there's no
        // reason to forward it on and we just send a generic error.
        statusSubject.next(STATUS_ERROR)
        const errMsg = `Websocket ${hostString} experienced an error`
        subscriber.error(new Error(errMsg))
      })

      ws.on('open', () => {
        ws.on('message', data => {
          const deserialized = deserialize(JSON.parse(data))
          log('Received', deserialized)
          subscriber.next(deserialized)
        })

        ws.on('close', e => {
          // This will happen if the socket is closed by the server If
          // .close is called from the client (see closeSocket), this
          // listener will be removed
          statusSubject.next(STATUS_DISCONNECTED)
          if (e.code !== 1000 || !e.wasClean) {
            subscriber.error(
              new Error(`Socket closed unexpectedly with code: ${e.code}`), e)
          } else {
            subscriber.complete()
          }
        })

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
      })
      return () => {
        if (handshakeDisp) {
          handshakeDisp.unsubscribe()
        }
        // This is the "unsubscribe" method on the final Subject
        closeSocket(1000, '')
      }
    })::share() // This makes it a "hot" observable, and refCounts it
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
    }

    super(socketSubscriber, socketObservable)

    // Subscriptions will be the observable containing all
    // queries/writes/changefeed requests. Specifically, the documents
    // that initiate them, each one with a different request_id
    const subscriptions = new Subject()
    // Unsubscriptions is similar, only it holds only requests to
    // close a particular request_id on the server. Currently we only
    // need these for changefeeds.
    const unsubscriptions = new Subject()
    const outgoing = Observable::merge(subscriptions, unsubscriptions)
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
      let unsubscribeRequest
      if (rawRequest.type === 'subscribe') {
        unsubscribeRequest = { request_id, type: 'end_subscription' }
      }
      // First, increment activeRequests and decide if we need to
      // connect to the socket
      incrementActive()

      // Now send the request to the server
      subscriptions.next(rawRequest)

      // Create an observable from the socket that filters by request_id
      const unsubscribeFilter = this
            ::filter(x => x.request_id === request_id)
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
                  } catch (e) { }
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
        if (unsubscribeRequest) {
          unsubscriptions.next(unsubscribeRequest)
        }
        decrementActive()
        unsubscribeFilter.unsubscribe()
      }
    })
  }
}

module.exports = HorizonSocket
