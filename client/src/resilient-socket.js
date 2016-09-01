import { BehaviorSubject } from 'rxjs/BehaviorSubject'
import { WebSocketSubject } from 'rxjs/observable/dom/WebSocketSubject'
import { Observable } from 'rxjs/Observable'
import 'rxjs/add/observable/merge'
import 'rxjs/add/observable/never'
import 'rxjs/add/observable/timer'
import 'rxjs/add/operator/filter'
import 'rxjs/add/operator/share'
import 'rxjs/add/operator/ignoreElements'
import 'rxjs/add/operator/concat'
import 'rxjs/add/operator/takeWhile'
import 'rxjs/add/operator/publish'
import 'rxjs/add/operator/cache'


import { PROTOCOL_VERSION, ProtocolError } from './socket'
import { serialize, deserialize } from './serialization'

// hacks
import './hacks/web-socket-subject'

export class SocketWrapper {
  constructor({
    url,              // Full url to connect to
    handshakeMaker, // function that returns handshake to emit
    keepalive = 60,   // seconds between keepalive messages
    WebSocketCtor = WebSocket,    // optionally provide a WebSocket constructor
    websocket,
  }) {
    this.requestCounter = 0
    this.handshakeMaker = handshakeMaker
    this.ws = new WebSocketSubject({
      url,
      protocol: PROTOCOL_VERSION,
      socket: websocket,
      WebSocketCtor,
      openObserver,
      closeObserver,
      closingObserver,
    })
    this.handshakes = Observable.cache(1).filter(x => x != null)
  }

  sendHandshake(msg) {
    this.ws.next(JSON.stringify(serialize(msg)))
  }

  send(msg) {
    this.handshakes
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
        this.sendHandshake()
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
