import { AsyncSubject } from 'rxjs/AsyncSubject'
import { BehaviorSubject } from 'rxjs/BehaviorSubject'
import { Subject } from 'rxjs/Subject'
import { WebSocketSubject } from 'rxjs/observable/dom/WebSocketSubject'
import { Observable } from 'rxjs/Observable'
import 'rxjs/add/observable/merge'
import 'rxjs/add/observable/never'
import 'rxjs/add/observable/timer'
import 'rxjs/add/observable/defer'
import 'rxjs/add/operator/filter'
import 'rxjs/add/operator/share'
import 'rxjs/add/operator/ignoreElements'
import 'rxjs/add/operator/concat'
import 'rxjs/add/operator/takeWhile'
import 'rxjs/add/operator/publish'
import 'rxjs/add/operator/cache'


import { PROTOCOL_VERSION,
         ProtocolError,
         STATUS_UNCONNECTED,
         STATUS_READY,
         STATUS_ERROR,
         STATUS_CLOSING,
         STATUS_DISCONNECTED,
       } from './socket'
import { serialize, deserialize } from './serialization'


export class SocketWrapper {
  constructor({
    url,              // Full url to connect to
    handshakeMaker, // function that returns handshake to emit
    keepalive = 60,   // seconds between keepalive messages
    WebSocketCtor = WebSocket,    // optionally provide a WebSocket constructor
    websocket,
  }) {
    this.requestCounter = 0
    this.status = new BehaviorSubject(STATUS_UNCONNECTED)
    this.handshakes = new BehaviorSubject()
    this.handshakeMaker = handshakeMaker
    this.websockets = infiniteSockets({
      url,
      protocol: PROTOCOL_VERSION,
      socket: websocket,
      WebSocketCtor,
      openObserver: () => {
        this.sendHandshake()
      },
      closingObserver: () => this.status.next(STATUS_CLOSING),
      closeObserver: () => {
        this.status.next(STATUS_DISCONNECTED)
        this.cleanupHandshake()
      },
    })
    this.keepalive = Observable
      .timer(keepalive * 1000, keepalive * 1000)
      .switchMap(() => this.makeRequest({ type: 'keepalive' }))
  }

  // Send the handshake if it hasn't been sent already. It also starts
  // the keepalive observable and cleans up after it when the
  // handshake is cleaned up.
  sendHandshake() {
    if (!this._handshakeSub) {
      this._handshakeSub = this.makeRequest(this._handshakeMaker())
        .subscribe({
          next: n => {
            if (n.error) {
              this.status.next(STATUS_ERROR)
              this.handshake.error(new ProtocolError(n.error, n.error_code))
            } else {
              this.status.next(STATUS_READY)
              this.handshakes.next(n)
            }
          },
          error: e => {
            this.status.next(STATUS_ERROR)
            this.handshakes.next(null)
            this.cleanupHandshake()
            this.ws.error(e)
          },
        })

      // Start the keepalive and make sure it's
      // killed when the handshake is cleaned up
      this._handshakeSub.add(this.keepalive.connect())
    }
    return this.handshakes
  }

  send(msg) {
    this.handshakes
      .filter(x => x !== null)
      .take(1)
      // Any handshake will be mapped to the request
      .map(() => JSON.stringify(serialize(msg)))
      // The websocket's next method will be called with the request
      .subscribe(this.ws)
  }

  makeRequest(rawRequest, shouldEndSubscription = true, handshake = false) {
    return new Observable(observer => {
      const request_id = this.requestCounter++
      const request = Object.assign({ request_id }, request)

      if (handshake) {
        this.ws.next(JSON.stringify(serialize(request)))
      } else {
        this.send(request)
      }

      const subscription = this.ws.subscribe({
        next(resp) {
          // Multiplex by request id on all incoming messages
          if (resp.request_id === request_id) {
            if (resp.error !== undefined) {
              observer.error(ProtocolError(resp.error, resp.error_code))
            }
            for (const d of resp.data) {
              // Only need to deserialize data coming back
              observer.next(deserialize(d))
            }
            if (resp.state !== undefined) {
              // Create a little dummy object for sync notifications
              observer.next({
                type: 'state',
                state: resp.state,
              })
            }
            if (resp.state === 'complete') {
              observer.complete()
            }
          }
        },
        error(err) { observer.error(err) },
        complete() { observer.complete() },
      })

      return () => {
        if (shouldEndSubscription) {
          this.send({ request_id, type: 'end_subscription' })
        }
        subscription.unsubscribe()
      }
    })
  }
}


export function connectionSmoother(horizonParams) {
  const controlSignals = new Subject()
  const sockets = infiniteHorizonSockets(controlSignals, horizonParams)
  const statuses = sockets.switchMap(socket => socket.status).cache(1)

  return {
    controlSignals,
    sockets,
    handshakes: sockets.switchMap(socket => socket.handshake),
    statuses,
    sendRequest(clientType, options) {
      const type = clientType === 'removeAll' ? 'remove' : clientType
      return sockets
        // Each time we get a new socket, we'll send the request
        .switchMap(socket => socket.makeRequest({ type, options }))
        // Share to prevent re-sending requests whenever a subscriber shows up
        .share()
    },
    connect() {
      controlSignals.next('connect')
    },
    disconnect() {
      controlSignals.next('disconnect')
    },
  }
}

function infiniteSockets(signals, params) {
  return signals
    // We only care about two signals
    .filter(x => x === 'connect' || x === 'disconnect')
    // Create a new socket if we're to connect
    .map(signalName => {
      if (signalName === 'connect') {
        return new WebSocketSubject(params)
      } else {
        return signalName
      }
    })
    // Cache the last socket so we don't keep creating them on subscribe
    .cache(1)
    // Filter out disconnect signals so new subscribers don't get the cached
    // horizon socket after a disconnect message
    .filter(x => x === 'disconnect')
}
