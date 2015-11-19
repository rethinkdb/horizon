require('babel-polyfill')
const snakeCase = require('snake-case')
const {
  FusionEmitter,
  ListenerSet,
  validIndexValue,
} = require('./utility.js')

const PROTOCOL_VERSION = 'rethinkdb-fusion-v0'

function responseEvent(id){
  return `response:${id}`
}
function errorEvent(id){
  return `error:${id}`
}

var fusionCount = 0

function checkNonNull(name, arg){
  if(arg === null){
    throw new Error(`The argument to ${name} must be non-null`)
  }else if(arg === undefined){
    throw new Error(`The argument to ${name} must be defined`)
  }
}

class Fusion extends FusionEmitter {
  constructor(host, {secure: secure=true, debug: debug=true}={}){
    super(`Fusion(${fusionCount++})`)
    if(debug){
      this.log = (...args) => console.debug(...args)
    }else{
      this.log = () => undefined
    }
    // Allow calling a fusion object
    let self = name => this.collection(name)
    Object.setPrototypeOf(self, this)

    this.host = host
    this.secure = secure
    this.requestCounter = 0
    this.socket = new FusionSocket(host, secure, this.log)
    this.listenerSet = ListenerSet.absorbEmitter(this.socket)
      .onceAndDispose('error', (err) => this.emit('error', err, self))
      .on('connected', () => this.emit('connected', self))
      .on('disconnected', () => this.emit('disconnected', self))
    // send handshake
    this.handshakeResponse = this.socket.getPromise('connected').then(() => {
      let reqId = this.requestCounter++
      this.socket.send({request_id: reqId})
      return this.socket.getPromise(responseEvent(reqId)).then((res) => {
        return res
      })
    }).catch(() => {})
    return self
  }

  dispose(reason='Fusion object disposed'){
    // The listenerSet owns the fusionSocket, so will dispose of it.
    return this.listenerSet.dispose(reason)
  }

  collection(collectionName){
    return new Collection(this, collectionName)
  }

  writeOp(opType, collectionName, documents){
    let command = {data: documents, collection: collectionName}
    return this._send(opType, command).intoCollectingPromise('response')
  }

  query(data){
    return this._send('query', data).intoCollectingPromise('response')
  }

  subscribe(query, updates=true){
    if(updates){
      return this._subscribe(query)
    }else{
      return this._send('query', query)
    }
  }

  endSubscription(requestId){
    return this.handshakeResponse.then(handshake => {
      this.socket.send({request_id: requestId, type: 'end_subscription'})
    })
  }

  _send(type, data){
    let requestId = this.requestCounter++
    let req = {type: type, options: data, request_id: requestId}
    this.handshakeResponse.then((handshake) => {
      this.socket.send(req)
    })
    return new RequestEmitter(requestId, this, 'query')
  }

  // Subscription queries, only handles returning an emitter
  _subscribe(query){
    let requestId = this.requestCounter++
    let req = {type: 'subscribe', options: query, request_id: requestId}
    this.handshakeResponse.then((handshake) => this.socket.send(req))
    return new RequestEmitter(requestId, this, 'subscribe')
  }

}

var socketCount = 0

class FusionSocket extends FusionEmitter {
  // Wraps native websockets in an EventEmitter, and deals with some
  // simple protocol level things like serializing from/to JSON, and
  // emitting events on request_ids
  constructor(host, secure=true, debug_func){
    super(`FusionSocket(${socketCount++})`)
    this.log = debug_func
    let hostString = (secure ? 'wss://' : 'ws://') + host
    this._ws = new WebSocket(hostString, PROTOCOL_VERSION)
    this._openWs = new Promise((resolve, reject) => {
      this._ws.onopen = (event) => {
        this.emit('connected', event)
        resolve(this._ws)
      }
      this._ws.onerror = (event) => {
        this.emit('error', event)
        reject(event)
      }
      this._ws.onclose = (event) => {
        this.emit('disconnected', event)
        reject(event)
      }
    })
    this._ws.onmessage = (event) => {
      let data = JSON.parse(event.data)
      this.log("Received", JSON.stringify(data, undefined, 2))
      if(data.request_id === undefined){
        this.emit("error", "Request id undefined", data)
      }else if(data.error !== undefined){
        this.emit(errorEvent(data.request_id), data)
      }else {
        this.emit(responseEvent(data.request_id), data)
      }
    }
  }

  send(message){
    if(typeof message !== 'string'){
      message = JSON.stringify(message, undefined, 4)
    }
    this.log("Sending", message)
    this._openWs.then((ws) => ws.send(message))
  }

  dispose(reason='FusionSocket disposed'){
    this._ws.close(1000, reason)
    return this.getPromise('disconnected')
  }

}

// These are created for requests, will only get messages for the
// particular request id. Has extra methods for closing the request,
// and for creating promises that resolve or reject based on events
// from this emitter
class RequestEmitter extends FusionEmitter {
  constructor(requestId, fusion, queryType){
    super(`RequestEmitter(${requestId})`)
    this.fusion = fusion
    this.requestId = requestId
    this.queryType = queryType
    this.remoteListeners = ListenerSet.onEmitter(this.fusion.socket)
    //Forwards on fusion events to this emitter's listeners
    this.remoteListeners
      .fwd('connected', this)
      .fwd('disconnected', this)
      .onceAndDispose(errorEvent(requestId), (err) => {
        this.emit('error', err)
      }).on(responseEvent(requestId), (response) => {
        if(Array.isArray(response.data)){
          let emitted = false
          response.data.forEach(changeObj => {
            emitted = this._emitChangeEvent(changeObj)
          })
          if(!emitted){
              this.emit('response', response.data)
          }
        }else if(response.data !== undefined){
          this.emit("response", response.data)
        }
        if(response.state === 'synced'){
          this.emit('synced')
        }else if(response.state === 'complete'){
          this.emit('complete')
        }
      }).disposeOn('error')
  }

  _emitChangeEvent(changeObj){
    if(changeObj.new_val === undefined && changeObj.old_val === undefined){
      return false
    }
    if(changeObj.new_val !== null && changeObj.old_val !== null){
      if(this.listenerCount('changed') === 0){
        this.emit('removed', changeObj.old_val)
        this.emit('added', changeObj.new_val)
      }else{
        this.emit('changed', changeObj.new_val, changeObj.old_val)
      }
      return true
    }else if(changeObj.new_val !== null && changeObj.old_val === null){
      this.emit('added', changeObj.new_val)
      return true
    }else if(changeObj.new_val === null && changeObj.old_val !== null){
      this.emit('removed', changeObj.old_val)
      return true
    }else{
      return false
    }
  }
  dispose(reason=`RequestEmitter for ${this.requestId} disposed`){
    if(this.type === 'subscription'){
      return this.fusion.endSubscription(this.requestId)
        .then(() => this.getPromise('complete'))
        .then(() => this.remoteListeners.dispose(reason))
    }else{
      return this.remoteListeners.dispose(reason)
    }
  }
}

class TermBase {

  constructor(fusion, query, mergeObj){
    this.fusion = fusion
    for(let key in Object.keys(mergeObj)){
      if(key in query){
        throw new Error(`${key} is already defined.`)
      }
    }
    this.query = Object.assign({}, query, mergeObj)
  }

  subscribe(updates=true){
    // should create a changefeed query, return eventemitter
    return this.fusion.subscribe(this.query, updates)
  }

  value(){
    // return promise with no changefeed
    return this.fusion.query(this.query)
  }

  // Extend the object with the specified methods. Will fill in
  // error-raising methods for methods not specified, or if the method
  // has already been added to the query object.
  _extendWith(...keys){
    let methods = {
      findAll: FindAll.method,
      find: Find.method,
      order: Order.method,
      above: Above.method,
      below: Below.method,
      limit: Limit.method,
    }
    for(let key in methods){
      if(keys.indexOf(key) !== -1){
        // Check if query object already has it. If so, insert a dummy
        // method that throws an error.
        if(snakeCase(key) in this.query){
          if(snakeCase(key) === 'below'){
            console.log(`${JSON.stringify(this.query)} already has "${snakeCase(key)}"`)
          }
          this[key] = function(){
            throw new Error(`${key} has already been called on this query`)
          }
        }else{
          this[key] = methods[key]
        }
      }else{
        this[key] = function(){
          throw new Error(`it is not valid to chain the method ${key} from here`)
        }
      }
    }
  }
}

class Collection extends TermBase {

  constructor(fusion, collectionName){
    super(fusion, {
      collection: collectionName,
    }, {})
    this._collectionName = collectionName
    this._extendWith('find', 'findAll', 'order', 'above', 'below', 'limit')
  }

  store(documents){
    return this._writeOp('store', documents)
  }

  upsert(documents){
    return this._writeOp('upsert', documents)
  }

  insert(documents){
    return this._writeOp('insert', documents)
  }

  replace(documents){
    return this._writeOp('replace', documents)
  }

  update(documents){
    return this._writeOp('update', documents)
  }

  remove(documentOrId){
    checkNonNull('remove', documentOrId)
    if(arguments.length > 1){
      throw new Error("remove takes exactly one argument")
    }
    if(validIndexValue(documentOrId)){
      documentOrId = {id: documentOrId}
    }
    return this._writeOp('remove', [documentOrId]).then(() => undefined)
  }

  removeAll(documentsOrIds){
    checkNonNull('removeAll', documentsOrIds)
    if(!Array.isArray(documentsOrIds)){
      throw new Error("removeAll takes an array as an argument")
    }
    if(arguments.length > 1){
      throw new Error("removeAll only takes one argument (an array)")
    }
    documentsOrIds = documentsOrIds.map(item => {
      if(validIndexValue(item)){
        return {id: item}
      }else{
        return item
      }
    })
    return this._writeOp('remove', documentsOrIds).then(() => undefined)
  }

  _writeOp(name, documents){
    checkNonNull(name, documents)
    if(!Array.isArray(documents)){
      documents = [documents]
    }else if(documents.length === 0){
      // Don't bother sending no-ops to the server
      return Promise.resolve([])
    }
    return this.fusion.writeOp(name, this._collectionName, documents)
  }
}

class FindAll extends TermBase {
  constructor(fusion, query, fieldValues, allowChaining){
    super(fusion, query, {
      find_all: fieldValues,
    })
    if(allowChaining){
      this._extendWith('order', 'above', 'below', 'limit')
    }else{
      this._extendWith()
    }
  }

  static method(...fieldValues){
    if(arguments.length === 0){
      throw new Error(`findAll must take at least one argument`)
    }
    let wrappedFields = fieldValues.map(item => {
      if(validIndexValue(item)){
        return {id: item}
      }else{
        return item
      }
    })
    let allowChaining = wrappedFields.length === 1
    return new FindAll(this.fusion, this.query, wrappedFields, allowChaining)
  }
}

class Find extends TermBase {
  constructor(fusion, query, queryObject){
    super(fusion, query, {
      find: queryObject,
    })
    this._extendWith()
  }

  value(){
    this.fusion.log("FINDING SOMETHING")
    return super.value().then(resp => {
      this.fusion.log("Testing")
      if(resp.length > 0){
        return resp[0]
      }else{
        return null
      }
    })
  }

  static method(idOrObject){
    checkNonNull('find', idOrObject)
    let q = validIndexValue(idOrObject) ? {id: idOrObject} : idOrObject
    return new Find(this.fusion, this.query, q)
  }
}

class Above extends TermBase {
  constructor(fusion, query, valueSpecs, direction){
    super(fusion, query, {
      above: [valueSpecs, direction]
    })
    this._extendWith('findAll', 'order', 'below', 'limit')
  }

  static method(aboveSpec, bound="closed"){
    checkNonNull('above', aboveSpec)
    return new Above(this.fusion, this.query, aboveSpec, bound)
  }
}

class Below extends TermBase {
  constructor(fusion, query, valueSpecs, direction){
    super(fusion, query, {
      below: [valueSpecs, direction],
    })
    this._extendWith('findAll', 'order', 'above', 'limit')
  }

  static method(belowSpec, bound="open"){
    checkNonNull('below', belowSpec)
    return new Below(this.fusion, this.query, belowSpec, bound)
  }
}

class Order extends TermBase {
  constructor(fusion, query, fields, direction){
    super(fusion, query, {
      order: [fields, direction],
    })
    this._extendWith('findAll', 'above', 'below', 'limit')
  }

  static method(fields, direction='ascending'){
    checkNonNull('order', fields)
    let wrappedFields = Array.isArray(fields) ? fields : [fields]
    return new Order(this.fusion, this.query, wrappedFields, direction)
  }
}

class Limit extends TermBase {
  constructor(fusion, query, size){
    super(fusion, query, {limit: size})
    this._extendWith()
  }

  static method(size){
    checkNonNull('limit', size)
    return new Limit(this.fusion, this.query, size)
  }
}

module.exports = Fusion
