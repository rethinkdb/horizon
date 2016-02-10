'use strict'

require('babel-polyfill')

const Rx = require('rx')
const { Collection } = require('./ast.js')
const FusionSocket = require('./socket.js')
const { log, logError, enableLogging } = require('./logging.js')
const { subscribeOrObservable } = require('./utility.js')

module.exports = Fusion

function Fusion(host, { secure: secure = true, path: path = 'fusion' } = {}) {
  // Websocket Subject
  const socket = new FusionSocket(host, secure, path)

  // This is the object returned by the Fusion function. It's a
  // function so we can construct a collection simply by calling it
  // like fusion('my_collection')
  function fusion(name) {
    return new Collection(sendRequest, name)
  }

  fusion.dispose = () => {
    socket.onCompleted()
  }

  // Dummy subscription to force it to connect to the
  // server. Optionally provide an error handling function if the
  // socket experiences an error.
  // Note: Users of the Observable interface shouldn't need this
  fusion.connect = onError => {
    if (!onError) {
      onError = err => { console.error(`Received an error: ${err}`) }
    }
    socket.subscribe(
      () => {},
      onError
    )
  }

  // Either subscribe to status updates, or return an observable with
  // the current status and all subsequent status changes.
  fusion.status = subscribeOrObservable(socket.status)

  // Convenience method for finding out when disconnected
  fusion.onDisconnected = subscribeOrObservable(
    socket.status.filter(x => x.type === 'disconnected'))

  // Convenience method for finding out when opening
  fusion.onConnected = subscribeOrObservable(
    socket.status.filter(x => x.type === 'connected'))

  // Convenience method for finding out when an error occurs
  fusion.onSocketError = subscribeOrObservable(
    socket.status.filter(x => x.type === 'error'))

  return fusion

  // Sends a fusion protocol request to the server, and pulls the data
  // portion of the response out.
  function sendRequest(type, options) {
    // Both remove and removeAll use the type 'remove' in the protocol
    const normalizedType = type === 'removeAll' ? 'remove' : type
    return socket
      .makeRequest({ type: normalizedType, options }) // send the raw request
      .concatMap(resp => {
        // unroll arrays being returned
        if (resp.data) {
          return resp.data
        } else {
          // Still need to emit a document even if we have no new data
          return [ { state: resp.state, type: resp.type } ]
        }
      })
      .catch(e => Rx.Observable.create(observer => {
        observer.onError(new Error(e.error))
      })) // on error, strip error message
  }
}

Fusion.log = log
Fusion.logError = logError
Fusion.enableLogging = enableLogging
Fusion.Socket = FusionSocket
