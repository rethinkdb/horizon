'use strict'

require('babel-polyfill')

const { setImmediate } = require('./utility.js')
const { MultiEvent, promiseOnEvents } = require('./events.js')
const { Collection, TermBase } = require('./ast.js')

const { WebSocket, Rx } = require('./shim.js')
const { serialize, deserialize } = require('./serialization.js')

module.exports = Fusion

const PROTOCOL_VERSION = 'rethinkdb-fusion-v0'

let fusionCount = 0

function Fusion(host, { secure: secure = true, path: path = 'fusion' } = {}) {
  // Hack so we can do fusion('foo') to create a new collection
  let fusion = Collection(TermBase(createSubscription, query, writeOp))
  let count = fusionCount++
  fusion.toString = () => `Fusion(${count})`

  // underlying WebSocket
  let socket = FusionSocket(host, secure, path)
  // Map requestId -> {broadcastError, broadcastResponse, dispose}
  let outstanding = new Map()
  // counter for correlating requests and responses
  let requestCounter = 0

  Object.assign(fusion, MultiEvent({
    onError(broadcast) {
      socket.onError(err => broadcast(err))
    },
    onConnected(broadcast) {
      socket.onConnected(() => {
        broadcast(fusion)
      })
    },
    onDisconnected(broadcast) {
      socket.onDisconnected(() => {
        broadcast(fusion)
      })
    },
    dispose(cleanupFusionEvents) {
      return socket.dispose().then(() => {
        setImmediate(cleanupFusionEvents)
      })
    },
  }))

  socket.onMessage(socketMessageCallback)

  let handshaken = socket
        .connectedPromise
        .then(() => createRequest((reqId, events) => {
          return socket.send({ request_id: reqId })
            .then(() => new Promise((resolve, reject) => {
              events.onResponse(resp => {
                events.dispose()
                resolve(resp)
              })
              events.onError(error => {
                events.dispose()
                reject(new Error(error.error))
              })
            }))
        }))

  return fusion

  // Helpers and methods defined below

  function createRequest(func) {
    let reqId = requestCounter++
    let broadcastError, broadcastResponse
    let event = MultiEvent({
      onResponse(broadcast) {
        broadcastResponse = broadcast
      },
      onError(broadcast) {
        broadcastError = broadcast
      },
      dispose(cleanupEvents) {
        outstanding.delete(reqId)
        setImmediate(cleanupEvents)
        // we don't call .dispose on the value in outstanding since
        // that's what's being called right now
      },
    })
    outstanding.set(reqId, {
      broadcastResponse,
      broadcastError,
      dispose: event.dispose,
    })
    return func(reqId, event)
  }

  function socketMessageCallback(data) {
    if (!outstanding.has(data.request_id)) {
      console.error(`Unrecognized request id in:`, data)
    } else {
      let req = outstanding.get(data.request_id)
      if (data.error !== undefined) {
        req.broadcastError(new Error(data.error))
      } else {
        req.broadcastResponse({ state: data.state, data: data.data })
      }
    }
  }

  function send(type, data) {
    return createRequest((reqId, events) => {
      let req = { type: type, options: data, request_id: reqId }
      let resp = eventsToPromise(events)
      return handshaken
        .then(() => socket.send(req))
        .then(() => resp)
    })
  }

  // Takes an event for responses, and coalesces them into a single
  // array. When a response with `state: complete` is received, the
  // promise is resolved with the array. If the errorEvent fires, the
  // promise is rejected
  function eventsToPromise(events) {
    let results = []
    return new Promise((resolve, reject) => {
      events.onResponse(rawResponse => {
        results.push.apply(results, rawResponse.data)
        if (rawResponse.state === 'complete') {
          events.dispose()
          resolve(results)
        }
      })
      events.onError(err => {
        events.dispose()
        reject(new Error(JSON.stringify(err)))
      })
    })
  }

  function createSubscription(queryOptions, userOptions) {
    return createRequest((reqId, events) => {
      let req = { type: 'subscribe', options: serialize(queryOptions), request_id: reqId }
      handshaken.then(() => socket.send(req))
      return Subscription({
        onResponse: events.onResponse,
        onError: events.onError,
        endSubscription: endSubscription(reqId),
        onConnected: fusion.onConnected,
        onDisconnected: fusion.onDisconnected,
        userOptions,
      })
    })
  }

  function writeOp(opType, collectionName, documents) {
    return send(opType, { data: serialize(documents), collection: collectionName })
  }

  function query(data) {
    return send('query', serialize(data))
  }

  function endSubscription(requestId) {
    return () => {
      // Can't use send since we need to set the requestId ourselves
      return handshaken.then(() => {
        return socket.send({ request_id: requestId, type: 'end_subscription' })
      })
    }
  }
}

Fusion.log = () => undefined
Fusion.logError = () => undefined

Fusion.enableLogging = (debug = true) => {
  if (debug) {
    Fusion.log = (...args) => console.debug(...args)
    Fusion.logError = (...args) => console.error(...args)
  } else {
    Fusion.log = () => undefined
    Fusion.logError = () => undefined
  }
}

let socketCount = 0

// Wraps native websockets with an event interface and deals with some
// simple protocol level things like serializing from/to JSON
function FusionSocket(host, secure, path) {
  let hostString = `ws${secure ? 's' : ''}://${host}/${path}`
  let ws = new WebSocket(hostString, PROTOCOL_VERSION)
  let socket // Set inside the promise initialization function

  let connectedPromise = new Promise((resolve, reject) => {
    let broadcastError; // used in two branches onMessage and onError
    socket = MultiEvent({
      onConnected(broadcastConnected) {
        ws.onopen = wsEvent => {
          broadcastConnected(wsEvent)
          resolve(wsEvent)
        }
      },
      onDisconnected(broadcastDisconnected) {
        ws.onclose = wsEvent => {
          broadcastDisconnected(wsEvent)
          reject(new Error(`websocket closed`))
        }
      },
      onError(broadcastErr) {
        ws.onerror = wsEvent => {
          broadcastError = broadcastErr
          broadcastError(wsEvent)
          reject(new Error('websocket error'))
        }
      },
      onMessage(broadcastMessage) {
        ws.onmessage = event => {
          let data = JSON.parse(event.data)
          if (data.error !== undefined) {
            Fusion.logError('Received Error', JSON.stringify(data, undefined, 2))
          } else {
            Fusion.log('Received', JSON.stringify(data, undefined, 2))
          }
          if (data.request_id === undefined) {
            broadcastError(
              `Received response with no request_id: ${event.data}`)
          } else {
            broadcastMessage(deserialize(data))
          }
        }
      },
      dispose(cleanupEvents) {
        ws.close(1000)
        return promiseOnEvents(socket.onDisconnected, socket.onError)
          .then(() => { setImmediate(cleanupEvents) })
      },
    })
  })

  Object.assign(socket, {
    // public methods & promise
    toString,
    connectedPromise,
    send,
  })

  return socket

  function toString() {
    return `FusionSocket([${socketCount++}]${hostString})`
  }

  function send(message) {
    let protoMessage = JSON.stringify(message, undefined, 4)
    Fusion.log('Sending', message)
    return connectedPromise.then(() => ws.send(protoMessage))
  }
}


// This is the object returned for changefeed queries
function Subscription({ onResponse,
                       onError,
                       endSubscription,
                       onConnected,
                       onDisconnected,
                       userOptions: userOptions = {} } = {}) {
  let sub = {}
  let broadcastAdded,
    broadcastRemoved,
    broadcastChanged,
    broadcastSynced,
    broadcastCompleted
  sub.onConnected = onConnected
  sub.onDisconnected = onDisconnected
  sub.onError = onError

  Object.assign(sub, MultiEvent({
    onAdded(broadcast) { broadcastAdded = broadcast },
    onRemoved(broadcast) { broadcastRemoved = broadcast },
    onChanged(broadcast) { broadcastChanged = broadcast },
    onSynced(broadcast) { broadcastSynced = broadcast },
    onCompleted(broadcast) { broadcastCompleted = broadcast },
    dispose(cleanupSubscriptionEvents) {
      return endSubscription().then(() => {
        setImmediate(() => {
          cleanupSubscriptionEvents()
          onResponse.dispose()
          onError.dispose()
        })
      })
    },
  }))

  Object.keys(userOptions).forEach(key => {
    switch (key) {
    case 'onAdded':
    case 'onRemoved':
    case 'onChanged':
    case 'onSynced':
    case 'onError':
    case 'onConnected':
    case 'onDisconnected':
    case 'onCompleted':
      sub[key](userOptions[key])
    }
  })

  let isAdded = c => c.new_val != null && c.old_val == null
  let isRemoved = c => c.new_val == null && c.old_val != null
  let isChanged = c => c.new_val != null && c.old_val != null

  onResponse(response => {
    // Response won't be an error since that's handled by the Fusion
    // object
    if (response.data !== undefined) {
      response.data.forEach(change => {
        if (isChanged(change)) {
          if (sub.onChanged.listenerCount() == 0) {
            broadcastRemoved(change.old_val)
            broadcastAdded(change.new_val)
          } else {
            broadcastChanged(change)
          }
        } else if (isAdded(change)) {
          broadcastAdded(change.new_val)
        } else if (isRemoved(change)) {
          broadcastRemoved(change.old_val)
        } else {
          console.error('Unknown object received on subscription: ', change)
        }
      })
    }
    if (response.state === 'synced') {
      broadcastSynced('synced')
    }
    if (response.state === 'complete') {
      broadcastCompleted('complete')
    }
  })

  // If the Rx module is available, create observables
  if (Rx) {
    Object.assign(sub, {
      observeChanged: observe(sub.onChanged, onError, sub.onCompleted),
      observeAdded: observe(sub.onAdded, onError, sub.onCompleted),
      observeRemoved: observe(sub.onRemoved, onError, sub.onCompleted),
      observeConnected: observe(sub.onConnected, onError, sub.onCompleted),
      observeDisconnected: observe(sub.onDisconnected, onError, sub.onCompleted),
      observeSynced: observe(sub.onSynced, onError, sub.onCompleted),
    })
  }

  return sub

  function observe(next, error, completed, dispose = sub.dispose) {
    return (maybeDispose = dispose) => Rx.Observable.create(observer => {
      let disposeEvent = next(val => observer.onNext(val))
      let disposeError = error(err => observer.onError(err))
      let disposeCompleted = completed(() => observer.onCompleted())
      return () => maybeDispose(function cleanup() {
        disposeEvent()
        disposeError()
        disposeCompleted()
      })
    })
  }
}
