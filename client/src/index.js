'use strict'

require('babel-polyfill')
const snakeCase = require('snake-case')
const {
  validIndexValue,
  promiseOnEvents,
  MultiEvent,
  strictAssign,
  ordinal,
  setImmediate,
} = require('./utility.js')

const { EventEmitter } = require('events')

const WebSocket = require('./websocket-shim.js')

const PROTOCOL_VERSION = 'rethinkdb-fusion-v0'

// Validation helper
function checkArgs(name, args, {
                    nullable: nullable = false,
                    minArgs: minArgs = 1,
                    maxArgs: maxArgs = 1 } = {}) {
  if (minArgs === maxArgs && args.length !== minArgs) {
    let plural = minArgs === 1 ? '' : 's'
    throw new Error(`${name} must receive exactly ${minArgs} argument${plural}`)
  }
  if (args.length < minArgs) {
    let plural = minArgs === 1 ? '' : 's'
    throw new Error(`${name} must receive at least ${minArgs} argument${plural}.`)
  }
  if (args.length > maxArgs) {
    let plural = maxArgs === 1 ? '' : 's'
    throw new Error(`${name} accepts at most ${maxArgs} argument${plural}.`)
  }
  for (let i = 0; i < args.length; i++) {
    if (!nullable && args[i] === null) {
      let ordinality = maxArgs !== 1 ? ` ${ordinal(i + 1)}` : ''
      throw new Error(`The${ordinality} argument to ${name} must be non-null`)
    }
    if (args[i] === undefined) {
      throw new Error(`The ${ordinal(i + 1)} argument to ${name} must be defined`)
    }
  }
}

let fusionCount = 0

function Fusion(host, { secure: secure = true } = {}) {
  // Hack so we can do fusion('foo') to create a new collection
  let fusion = Collection(TermBase(createSubscription, query, writeOp))
  Object.setPrototypeOf(fusion, new EventEmitter())
  let count = fusionCount++
  fusion.toString = () => `Fusion(${count})`

  // underlying WebSocket
  let socket = FusionSocket(host, secure)
  // Map requestId -> {broadcastError, broadcastResponse, dispose}
  let outstanding = new Map()
  // counter for correlating requests and responses
  let requestCounter = 0

  Object.assign(fusion, MultiEvent({
    onError(broadcast) {
      socket.onError(err => {
        broadcast(err)
        fusion.emit('error', err, fusion)
      })
    },
    onConnected(broadcast) {
      socket.onConnected(() => {
        broadcast(fusion)
        fusion.emit('connected', fusion)
      })
    },
    onDisconnected(broadcast) {
      socket.onDisconnected(() => {
        broadcast(fusion)
        fusion.emit('disconnected', fusion)
      })
    },
    dispose(cleanupFusionEvents) {
      return socket.dispose().then(() => {
        setImmediate(() => {
          cleanupFusionEvents()
          fusion.removeAllListeners('error')
          fusion.removeAllListeners('connected')
          fusion.removeAllListeners('disconnected')
        })
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
        req.broadcastError(data)
      } else {
        req.broadcastResponse(data)
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
      let req = { type: 'subscribe', options: queryOptions, request_id: reqId }
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
    return send(opType, { data: documents, collection: collectionName })
  }

  function query(data) {
    return send('query', data)
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
function FusionSocket(host, secure = true) {
  let hostString = (secure ? 'wss://' : 'ws://') + host
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
            broadcastMessage(data)
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
  let emitter = new EventEmitter()
  let broadcastAdded,
    broadcastRemoved,
    broadcastChanged,
    broadcastSynced,
    broadcastCompleted
  emitter.onConnected = onConnected
  emitter.onDisconnected = onDisconnected
  emitter.onError = onError

  Object.assign(emitter, MultiEvent({
    onAdded(broadcast) {
      broadcastAdded = broadcast
    },
    onRemoved(broadcast) {
      broadcastRemoved = broadcast
    },
    onChanged(broadcast) {
      broadcastChanged = broadcast
    },
    onSynced(broadcast) {
      broadcastSynced = broadcast
    },
    onCompleted(broadcast) {
      broadcastCompleted = broadcast
    },
    dispose(cleanupSubscriptionEvents) {
      return endSubscription.then(() => {
        setImmediate(() => {
          cleanupSubscriptionEvents()
          onResponse.dispose()
          onError.dispose()
          emitter.removeAllListeners()
        })
      })
    },
  }))

  emitter.onAdded(ev => emitter.emit('added', ev))
  emitter.onRemoved(ev => emitter.emit('removed', ev))
  emitter.onChanged(ev => emitter.emit('changed', ev.new_val, ev.old_val))
  emitter.onSynced(ev => emitter.emit('synced', ev))
  emitter.onError(ev => emitter.emit('error', ev))
  emitter.onCompleted(ev => emitter.emit('completed', ev))

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
      emitter[key](userOptions[key])
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
          if (emitter.onChanged.listenerCount() <= 1) {
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

  return emitter
}


// The outer method is called by Fusion to supply its internal
// (private) functions for querying, subscribing and doing writes The
// returned method is given to each Term, and is called with its
// initializer, to customize the object returned.
function TermBase(createSubscription, queryFunc, writeOp) {
  let termBase = initializer => {
    let term = {}
    initializer(addMethods, writeOp)
    return term

    // Given a query object, this adds the subscribe and value methods
    // to the term
    function addMethods(queryObj, ...keys) {
      term.subscribe = options => createSubscription(queryObj, options)
      term.value = () => queryFunc(queryObj)

      // Extend the object with the specified methods. Will fill in
      // error-raising methods for methods not specified, or a method
      // that complains that the method has already been added to the
      // query object.
      let methods = {
        findAll: FindAll,
        find: Find,
        order: Order,
        above: Above,
        below: Below,
        limit: Limit,
      }
      for (let key in methods) {
        if (keys.indexOf(key) !== -1) {
          // Check if query object already has it. If so, insert a dummy
          // method that throws an error.
          if (snakeCase(key) in queryObj) {
            term[key] = () => {
              throw new Error(`${key} has already been called on this query`)
            }
          } else {
            term[key] = methods[key](queryObj, termBase)
          }
        } else {
          term[key] = () => {
            throw new Error(`it is not valid to chain the method ${key} from here`)
          }
        }
      }
      return term
    }
  }
  return termBase
}


function Collection(termBase) {
  return function(collectionName) {
    let query = { collection: collectionName }
    let fusionWrite // set inside call to termBase

    return Object.assign(termBase((addMethods, writeOp) => {
      addMethods(query, 'find', 'findAll', 'order', 'above', 'below', 'limit')
      fusionWrite = (name, args, documents) => {
        checkArgs(name, args)
        let wrappedDocs = documents
        if (!Array.isArray(documents)) {
          wrappedDocs = [ documents ]
        } else if (documents.length === 0) {
          // Don't bother sending no-ops to the server
          return Promise.resolve([])
        }
        return writeOp(name, collectionName, wrappedDocs)
      }
    }), {
      // Collection public write methods
      store,
      upsert,
      insert,
      replace,
      update,
      remove,
      removeAll,
    })

    function store(documents) {
      return fusionWrite('store', arguments, documents)
    }

    function upsert(documents) {
      return fusionWrite('upsert', arguments, documents)
    }

    function insert(documents) {
      return fusionWrite('insert', arguments, documents)
    }

    function replace(documents) {
      return fusionWrite('replace', arguments, documents)
    }

    function update(documents) {
      return fusionWrite('update', arguments, documents)
    }

    function remove(documentOrId) {
      let wrapped = validIndexValue(documentOrId) ? { id: documentOrId } : documentOrId
      return fusionWrite('remove', arguments, [ wrapped ]).then(() => undefined)
    }

    function removeAll(documentsOrIds) {
      if (!Array.isArray(documentsOrIds)) {
        throw new Error('removeAll takes an array as an argument')
      }
      if (arguments.length > 1) {
        throw new Error('removeAll only takes one argument (an array)')
      }
      let wrapped = documentsOrIds.map(item => {
        if (validIndexValue(item)) {
          return { id: item }
        } else {
          return item
        }
      })
      return fusionWrite('remove', arguments, wrapped).then(() => undefined)
    }
  }
}

function FindAll(previousQuery, termBase) {
  return function(...fieldValues) {
    checkArgs('findAll', arguments, { maxArgs: 100 })
    let wrappedFields = fieldValues.map(item => {
      if (validIndexValue(item)) {
        return { id: item }
      } else {
        return item
      }
    })
    let findAllQuery = strictAssign(previousQuery, { find_all: wrappedFields })
    return termBase(addMethods => {
      if (wrappedFields.length === 1) {
        addMethods(findAllQuery, 'order', 'above', 'below', 'limit')
      } else {
        addMethods(findAllQuery)
      }
    })
  }
}

function Find(previousQuery, termBase) {
  return function(idOrObject) {
    checkArgs('find', arguments)
    let findObject = validIndexValue(idOrObject) ? { id: idOrObject } : idOrObject
    let findQuery = strictAssign(previousQuery, { find: findObject })
    let term = termBase(addMethods => addMethods(findQuery))

    // Wrap the .value() method with a callback that unwraps the resulting array
    let superValue = term.value
    term.value = () => superValue().then(resp => resp[0])
    return term
  }
}

function Above(previousQuery, termBase) {
  return function(aboveSpec, bound = 'closed') {
    checkArgs('above', arguments, { minArgs: 1, maxArgs: 2 })
    let aboveQuery = strictAssign(previousQuery, { above: [ aboveSpec, bound ] })
    return termBase(addMethods => {
      addMethods(aboveQuery, 'findAll', 'order', 'below', 'limit')
    })
  }
}

function Below(previousQuery, termBase) {
  return function(belowSpec, bound = 'open') {
    checkArgs('below', arguments, { minArgs: 1, maxArgs: 2 })
    let belowQuery = strictAssign(previousQuery, { below: [ belowSpec, bound ] })
    return termBase(addMethods => {
      addMethods(belowQuery, 'findAll', 'order', 'above', 'limit')
    })
  }
}

function Order(previousQuery, termBase) {
  return function(fields, direction = 'ascending') {
    checkArgs('order', arguments, { minArgs: 1, maxArgs: 2 })
    let wrappedFields = Array.isArray(fields) ? fields : [ fields ]
    let orderQuery = strictAssign(previousQuery, {
      order: [ wrappedFields, direction ],
    })
    return termBase(addMethods => {
      addMethods(orderQuery, 'findAll', 'above', 'below', 'limit')
    })
  }
}

function Limit(previousQuery, termBase) {
  return function(size) {
    checkArgs('limit', arguments)
    let limitQuery = strictAssign(previousQuery, { limit: size })
    return termBase(addMethods => addMethods(limitQuery))
  }
}

module.exports = Fusion
