const { AsyncSubject, BehaviorSubject, Subject, Observable } = require('rxjs');

// TODO: size reduction
// const { AsyncSubject } = require('rxjs/subject/AsyncSubject');
// const { BehaviorSubject } = require('rxjs/subject/BehaviorSubject');
// const { Subject } = require('rxjs/Subject');
// const { Observable } = require('rxjs/Observable');
// require('rxjs/add/observable/merge');
// require('rxjs/add/operator/filter');
// require('rxjs/add/operator/merge');
// require('rxjs/add/operator/share');

const { WebSocket } = require('./shim.js')
const { serialize, deserialize } = require('./serialization.js')
const { log } = require('./logging.js')

const PROTOCOL_VERSION = 'rethinkdb-horizon-v0'
const HANDSHAKE = { method: 'unauthenticated' }

// Before connecting the first time
const STATUS_UNCONNECTED = { type: 'unconnected' }
// After the websocket is opened, but before handshake
const STATUS_CONNECTED = { type: 'connected' }
// After unconnected, maybe before or after connected. Any socket level error
const STATUS_ERROR = { type: 'error' }
// Occurs when the socket closes
const STATUS_DISCONNECTED = { type: 'disconnected' }

// Wraps native websockets with a Subject, which is both an Observer
// and an Observable (it is bi-directional after all!). This
// implementation is adapted from Rx.DOM.fromWebSocket and
// RxSocketSubject by Ben Lesh, but it also deals with some simple
// protocol level things like serializing from/to JSON, routing
// request_ids, looking at the `state` field to decide when an
// observable is closed.
class HorizonSocket extends Subject {
  constructor(host, secure, path) {
    const hostString = `ws${secure ? 's' : ''}://${host}/${path}`
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
    const socketObservable = Observable.create(observer => {
      ws = new WebSocket(hostString, PROTOCOL_VERSION)
      ws.onerror = () => {
        // If the websocket experiences the error, we forward it through
        // to the observable. Unfortunately, the event we receive in
        // this callback doesn't tell us much of anything, so there's no
        // reason to forward it on and we just send a generic error.
        statusSubject.next(STATUS_ERROR)
        const errMsg = `Websocket ${hostString} experienced an error`
        observer.error(new Error(errMsg))
      }
      ws.onopen = () => {
        // Send the handshake
        statusSubject.next(STATUS_CONNECTED)
        handshakeDisp = this.makeRequest(HANDSHAKE).subscribe(
          x => {
            handshake.next(x)
            handshake.complete()
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
      ws.onmessage = event => {
        const deserialized = deserialize(JSON.parse(event.data))
        log('Received', deserialized)
        observer.next(deserialized)
      }
      ws.onclose = e => {
        // This will happen if the socket is closed by the server If
        // .close is called from the client (see closeSocket), this
        // listener will be removed
        statusSubject.next(STATUS_DISCONNECTED)
        if (e.code !== 1000 || !e.wasClean) {
          observer.error(e)
        } else {
          observer.complete()
        }
      }
      return () => {
        if (handshakeDisp) {
          handshakeDisp.unsubscribe()
        }
        // This is the "dispose" method on the final Subject
        closeSocket(1000, '')
      }
    }).share() // This makes it a "hot" observable, and refCounts it
    // Note possible edge cases: the `share` operator is equivalent to
    // .multicast(() => new Subject()).refCount() // RxJS 5
    // .multicast(new Subject()).refCount() // RxJS 4

    // This is the Observer part of the Subject. How we can send stuff
    // over the websocket
    const socketObserver = {
      next(messageToSend) {
        // When next is called on this observer
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
        // The observer is receiving an error. Better close the
        // websocket with an error
        if (!error.code) {
          throw new Error('no code specified. Be sure to pass ' +
                          '{ code: ###, reason: "" } to error()')
        }
        closeSocket(error.code, error.reason)
      },
      complete() {
        // complete for the observer here is equivalent to "close
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
      ws.onopen = undefined
      ws.onclose = undefined
      ws.onmessage = undefined
    }

    super(socketObserver, socketObservable)

    // Subscriptions will be the observable containing all
    // queries/writes/changefeed requests. Specifically, the documents
    // that initiate them, each one with a different request_id
    const subscriptions = new Subject()
    // Unsubscriptions is similar, only it holds only requests to
    // close a particular request_id on the server. Currently we only
    // need these for changefeeds.
    const unsubscriptions = new Subject()
    const outgoing = Observable.merge(subscriptions, unsubscriptions)
    // How many requests are outstanding
    let activeRequests = 0
    // Monotonically increasing counter for request_ids
    let requestCounter = 0
    // Disposer for subscriptions/unsubscriptions
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
        // observable and an observer. Here it's acting as an observer,
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
    this.makeRequest = rawRequest => {
      // Get a new request id
      const request_id = requestCounter++
      // Add the request id to the request and the unsubscribe request
      // if there is one
      rawRequest.request_id = request_id
      let unsubscribeRequest
      if (rawRequest.type === 'subscribe') {
        unsubscribeRequest = { request_id, type: 'end_subscription' }
      }
      return Observable.create(reqObserver => {
        // First, increment activeRequests and decide if we need to
        // connect to the socket
        incrementActive()

        // Now send the request to the server
        subscriptions.next(rawRequest)

        // Create an observable from the socket that filters by request_id
        const disposeFilter = this
            .filter(x => x.request_id === request_id)
            .subscribe(
              resp => {
                // Need to faithfully end the stream if there is an error
                if (resp.error !== undefined) {
                  reqObserver.error(resp)
                } else if (resp.data !== undefined) {
                  reqObserver.next(resp)
                }
                if (resp.state === 'synced') {
                  // Create a little dummy object for sync notifications
                  reqObserver.next({
                    type: 'state',
                    state: 'synced',
                  })
                } else if (resp.state === 'complete') {
                  reqObserver.complete()
                }
              },
              err => reqObserver.error(err),
              () => reqObserver.complete()
            )
        return () => {
          // Unsubscribe if necessary
          if (unsubscribeRequest) {
            unsubscriptions.next(unsubscribeRequest)
          }
          decrementActive()
          disposeFilter.unsubscribe()
        }
      })
    }
  }
}

module.exports = HorizonSocket
