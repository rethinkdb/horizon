import { AsyncSubject } from 'rxjs/AsyncSubject'
import { BehaviorSubject } from 'rxjs/BehaviorSubject'
import { Subject } from 'rxjs/Subject'
import { Observable } from 'rxjs/Observable'
import { Subscription } from 'rxjs/Subscription'
import { Subscriber } from 'rxjs/Subscriber'
import 'rxjs/add/observable/merge'
import 'rxjs/add/operator/filter'
import 'rxjs/add/operator/share'

import { serialize, deserialize } from './serialization'

const PROTOCOL_VERSION = 'rethinkdb-horizon-v0'

export interface Request {
  request_id: number
}

interface ErrorResponse extends Response {
  error: string,
  error_code: number,
}

function isErrorResponse(resp: Response): resp is ErrorResponse {
  return (resp as ErrorResponse).error !== undefined
}

interface Handshake extends Request {
  method: 'unauthenticated' | 'anonymous' | 'token',
  token: string,
}

export interface WriteRequest extends Request {
  type: 'store' | 'update' | 'upsert' | 'insert' | 'replace' | 'remove'
  options: {
    collection: string,
    data: Array<Object>,
  }
}

export interface ReadRequest extends Request {
  type: 'query' | 'subscribe'
  options: ReadOptions
}

export interface ReadOptions {
  collection: string,
  order?: [string[], 'ascending' | 'descending'],
  above?: [Object, 'open' | 'closed'],
  below?: [Object, 'open' | 'closed'],
  find?: Object,
  find_all?: any[],
  limit?: number,
}

interface EndRequest extends Request {
  type: 'end_subscription'
}

export interface Response {
  request_id: number
}

export interface QueryResponse extends Response {
  data: Array<Object>
}

function isQueryResponse(resp: Response): resp is QueryResponse {
  return (resp as QueryResponse).data !== undefined
}

export interface StateResponse extends Response {
  state: "complete" | "synced",
}

export function isStateResponse(resp: Response): resp is StateResponse {
  return (resp as StateResponse).state !== undefined
}

export interface HandshakeSuccess extends Response {
  token: string,
}

function isHandshakeSuccess(resp: Response): resp is HandshakeSuccess {
  return !isErrorResponse(resp) && (resp as HandshakeSuccess).token !== undefined
}

interface Status {
  type: 'unconnected' | 'ready' | 'error' | 'disconnected'
}

// Before connecting the first time
const STATUS_UNCONNECTED: Status = { type: 'unconnected' }
// After the websocket is opened and handshake is completed
const STATUS_READY: Status = { type: 'ready' }
// After unconnected, maybe before or after connected. Any socket level error
const STATUS_ERROR: Status = { type: 'error' }
// Occurs when the socket closes
const STATUS_DISCONNECTED: Status = { type: 'disconnected' }

export class ProtocolError extends Error {
  errorCode: number

  constructor(msg: string, errorCode: number) {
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
export class HorizonSocket extends Subject<Response> {

  status: BehaviorSubject<Status>
  handshake: AsyncSubject<HandshakeSuccess>

  private requestCounter: number
  private activeRequests: number
  private outgoing: Observable<Request>
  private outgoingSub: Subscription
  // Subscriptions will be the observable containing all
  // queries/writes/changefeed requests. Specifically, the documents
  // that initiate them, each one with a different request_id
  private requests: Subject<Request>
  private endRequests: Subject<EndRequest>
  private ws: WebSocket

  constructor(
    host: string,
    secure: boolean,
    path: string,
    handshaker: () => Handshake) {
    const hostString = `ws${secure ? 's' : ''}:\/()\/${host}\/${path}`
    const msgBuffer: Array<Request> = []
    let handshakeSubscription: Subscription
    // Handshake is an AsyncSubject because we want it to always cache
    // the last value it received, like a promise
    const handshake = new AsyncSubject<HandshakeSuccess>()
    const statusSubject = new BehaviorSubject<Status>(STATUS_UNCONNECTED)

    // This is the observable part of the Subject. It forwards events
    // from the underlying websocket
    const socketObservable = Observable.create(
      (subscriber: Subscriber<Response>) => {
        let ws = this.ws = new WebSocket(hostString, PROTOCOL_VERSION)

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
          handshakeSubscription = this.makeRequest(handshaker()).subscribe({
            next(resp: Response) {
              if (isHandshakeSuccess(resp)) {
                handshake.next(resp)
                handshake.complete()
                statusSubject.next(STATUS_READY)
              } else {
                if (isErrorResponse(resp)) {
                  handshake.error(new Error(resp.error))
                } else {
                  handshake.error(
                    new Error(`Invalid handshake response ${resp}`))
                }
                statusSubject.next(STATUS_ERROR)
              }
            },
            error(e: Error) { handshake.error(e) },
            complete() { handshake.complete() },
          })
          // Send any messages that have been buffered
          while (msgBuffer.length > 0) {
            const msg = msgBuffer.shift()
            this.wsSend(msg)
          }
        }
        return () => {
          handshakeSubscription.unsubscribe()
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
      next(messageToSend: Request) {
        // When next is called on this subscriber
        // Note: If we aren't ready, the message is silently dropped
        if (this.isOpen()) {
          this.wsSend(messageToSend) // wsSend serializes to a string
        } else {
          msgBuffer.push(messageToSend)
        }
      },
      error(error: { code: number, reason: string }) {
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

    const closeSocket = (code: number, reason: string) => {
      statusSubject.next(STATUS_DISCONNECTED)
      if (this.ws != null) {
        if (!code) {
          this.ws.close() // successful close
        } else {
          this.ws.close(code, reason)
        }
        this.ws.onopen = () => {}
        this.ws.onclose = () => {}
        this.ws.onmessage = () => {}
        this.ws.onerror = () => {}
      }
    }

    super(socketSubscriber, socketObservable)

    const requests = new Subject<Request>()
    // Unsubscriptions is similar, only it holds only requests to
    // close a particular request_id on the server. Currently we only
    // need these for changefeeds.
    const endRequests = new Subject<EndRequest>()
    this.outgoing = Observable.merge(requests, endRequests)
    // How many requests are outstanding
    this.activeRequests = 0
    // Monotonically increasing counter for request_ids
    this.requestCounter = 0
    // Now that super has been called, we can add attributes to this
    this.handshake = handshake
    // Lets external users keep track of the current websocket status
    // without causing it to connect
    this.status = statusSubject
    this.ws = this.ws || null
  }

  isOpen() {
    return this.ws != null && this.ws.readyState === WebSocket.OPEN
  }

  // This is used externally to send requests to the server
  makeRequest(rawRequest: Request): Observable<Response> {
    return Observable.create((reqSub: Subscriber<Object>) => {
      // Get a new request id
      const requestId = this.requestCounter++
      // Add the request id to the request and the unsubscribe request
      // if there is one
      rawRequest.request_id = requestId
      const endRequest: EndRequest = { request_id: requestId, type: 'end_subscription' }
      // First, increment activeRequests and decide if we need to
      // connect to the socket
      this.incrementActive()

      // Now send the request to the server
      this.requests.next(rawRequest)

      // Create an observable from the socket that filters by request_id
      const unsubscribeFilter = this
        .filter(x => x.request_id === requestId)
        .subscribe({
          next(resp: Response) {
            // Need to faithfully end the stream if there is an error
            if (isErrorResponse(resp)) {
              reqSub.error(
                new ProtocolError(resp.error, resp.error_code))
            } else if (isQueryResponse(resp) || isHandshakeSuccess(resp)) {
              try {
                reqSub.next(resp)
              } catch (e) {
                // Was already closed, ignore
              }
            }
            if (isStateResponse(resp)) {
              switch (resp.state) {
              case 'synced':
                // Create a little dummy object
                // for sync notifications
                reqSub.next({
                  type: 'state',
                  state: 'synced',
                })
                break
              case 'complete':
                reqSub.complete()
                break
              default: {
                reqSub.error(new Error(`Unrecognized state: ${resp.state}`))
              }}
            }
          },
          error(err: Error) { reqSub.error(err) },
          complete() { reqSub.complete() },
        })
      return () => {
        // Unsubscribe if necessary
        this.endRequests.next(endRequest)
        this.decrementActive()
        unsubscribeFilter.unsubscribe()
      }
    })
  }

  // Serializes to a string before sending
  private wsSend(ws: WebSocket, msg: Request) {
    const stringMsg = JSON.stringify(serialize(msg))
    ws.send(stringMsg)
  }

  // Decrement the number of active requests on the socket, and
  // close the socket if we're the last request
  private decrementActive() {
    if (--this.activeRequests === 0 && this.outgoingSub != undefined) {
      this.outgoingSub.unsubscribe()
    }
  }
  private incrementActive() {
    if (++this.activeRequests === 1) {
      // We subscribe the socket itself to the subscription and
      // unsubscription requests. Since the socket is both an
      // observable and a subscriber. Here it's acting as an
      // subscriber, watching our requests.
      this.outgoingSub = this.outgoing.subscribe(this)
    }
  }

}
