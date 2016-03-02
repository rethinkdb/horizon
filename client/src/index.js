const { Observable } = require('rxjs');
// TODO: size reduction
// const { Observable } = require('rxjs/Observable');
// require('rxjs/add/observable/fromArray');
// require('rxjs/add/operator/catch');
// require('rxjs/add/operator/concatMap');
// require('rxjs/add/operator/do');
// require('rxjs/add/operator/filter');

// TODO: used by tests
// require('rxjs/add/operator/concat');
// require('rxjs/add/operator/ignoreElements');
// require('rxjs/add/operator/mergeMap');
// require('rxjs/add/operator/pluck');
// require('rxjs/add/operator/take');
// require('rxjs/add/operator/toArray')

const { Collection } = require('./ast.js')
const HorizonSocket = require('./socket.js')
const { log, logError, enableLogging } = require('./logging.js')
const { subscribeOrObservable } = require('./utility.js')

module.exports = Horizon


function Horizon({
  host = window && window.location && `${window.location.host}` || 'localhost:8181',
  secure = window && window.location && window.location.protocol === 'https:' || false,
  path = 'horizon',
  lazyWrites = false,
} = {}) {
  // Websocket Subject
  const socket = new HorizonSocket(host, secure, path)

  // This is the object returned by the Horizon function. It's a
  // function so we can construct a collection simply by calling it
  // like horizon('my_collection')
  function horizon(name) {
    return new Collection(sendRequest, name, lazyWrites)
  }

  horizon.dispose = () => {
    socket.complete()
  }

  // Dummy subscription to force it to connect to the
  // server. Optionally provide an error handling function if the
  // socket experiences an error.
  // Note: Users of the Observable interface shouldn't need this
  horizon.connect = (
    onError = err => { console.error(`Received an error: ${err}`) }
  ) => {
    socket.subscribe(
      () => {},
      onError
    )
  }

  // Either subscribe to status updates, or return an observable with
  // the current status and all subsequent status changes.
  horizon.status = subscribeOrObservable(socket.status)

  // Convenience method for finding out when disconnected
  horizon.onDisconnected = subscribeOrObservable(
    socket.status.filter(x => x.type === 'disconnected'))

  // Convenience method for finding out when opening
  horizon.onConnected = subscribeOrObservable(
    socket.status.filter(x => x.type === 'connected'))

  // Convenience method for finding out when an error occurs
  horizon.onSocketError = subscribeOrObservable(
    socket.status.filter(x => x.type === 'error'))

  return horizon

  // Sends a horizon protocol request to the server, and pulls the data
  // portion of the response out.
  function sendRequest(type, options) {
    // Both remove and removeAll use the type 'remove' in the protocol
    const normalizedType = type === 'removeAll' ? 'remove' : type
    return socket
      .makeRequest({ type: normalizedType, options }) // send the raw request
      .concatMap(resp => {
        // unroll arrays being returned
        if (resp.data) {
          return Observable.fromArray(resp.data)
        } else {
          // Still need to emit a document even if we have no new data
          return Observable.fromArray([ { state: resp.state, type: resp.type } ])
        }
      })
      .catch(e => Observable.create(observer => {
        observer.error(new Error(e.error))
      })) // on error, strip error message
  }
}

Horizon.log = log
Horizon.logError = logError
Horizon.enableLogging = enableLogging
Horizon.Socket = HorizonSocket
