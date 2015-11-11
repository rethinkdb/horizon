require('babel-polyfill')
const EventEmitter = require('events').EventEmitter

const PROTOCOL_VERSION = 'rethinkdb-fusion-v0'

function responseEvent(id){
  return `response:${id}`
}
function errorEvent(id){
  return `error:${id}`
}

//Pass a function's 'arguments' object to this and a promise to return
//if successful
function rejectIfNoArgs(name, args, onSuccess){
  if(args.length === 0){
    return Promise.reject(
      new Error(`${name} must receive at least one argument`))
  }else{
    return onSuccess
  }
}
let emitterCount = 0

class FusionEmitter extends EventEmitter {
  constructor(name=`FusionEmitter(${emitterCount++})`){
    super()
    this.name = name
    this.listenerSets = 0
  }
  // Returns a function that can be called to remove the listener
  // Otherwise works the same as 'on' for the underlying socket
  register(event, listener){
    this.on(event, listener)
    return () => {
      this.removeListener(event, listener)
    }
  }

  // Similar to `register` but wraps `once` instead of `on`
  registerOnce(event, listener){
    this.once(event, listener)
    return () => {
      this.removeListener(event, listener)
    }
  }

  //Forwards events from the current emitter to another emitter,
  //returning an unregistration function
  fwd(srcEvent, dst, dstEvent=srcEvent){
    return this.register(srcEvent, (...args) => dst.emit(dstEvent, ...args))
  }

  //Create a promise from this emitter, accepts on the given event
  //and rejects on the second event which defaults to 'error'
  getPromise(acceptEvent, rejectEvent='error'){
    let listenerSet = ListenerSet.onEmitter(this)
    return this._makePromise(listenerSet, acceptEvent, rejectEvent)
  }

  // The same as getPromise, but disposes the event emitter when it's
  // resolved or rejected. The underlying EventEmitter shouldn't be
  // used.
  intoPromise(acceptEvent, rejectEvent='error'){
    let listenerSet = ListenerSet.absorbEmitter(this)
    return this._makePromise(listenerSet, acceptEvent, rejectEvent)
  }

  _makePromise(listenerSet, acceptEvent, rejectEvent){
    return new Promise((resolve, reject) => {
      listenerSet
        .onceAndDispose(acceptEvent, resolve)
        .onceAndDispose(rejectEvent, (err) => {
          reject(new Error(err.error))
        })
    })
  }

  // Listens for all 'response' events, adding them to an
  // internal array. Once a response comes in that has state: the
  // complete event, it resolves the promise with all of the values
  // obtained so far.  The promise is rejected if an error event is
  // raised.
  collectingPromise(addEvent='response', completeEvent='complete'){
    let listenerSet = ListenerSet.onEmitter(this)
    return this._collectPromise(listenerSet, addEvent, completeEvent)
  }

  // Same as collectingPromise except disposes the underlying
  // EventEmitter when it is resolved or rejected
  intoCollectingPromise(addEvent='response', completeEvent='complete'){
    let listenerSet = ListenerSet.absorbEmitter(this)
    return this._collectPromise(listenerSet, addEvent, completeEvent)
  }

  _collectPromise(listenerSet, addEvent, completeEvent){
    return new Promise((resolve, reject) => {
      let values = [];
      listenerSet
        .on(addEvent, (items) => {
          values.push(...items)
        }).onceAndDispose(completeEvent, () => {
          resolve(values)
        }).onceAndDispose('error', (err) => {
          reject(new Error(err.error))
        })
    })
  }
}

// Handles hooking up a group of listeners to a FusionEmitter, and
// removing them all when certain events occur
class ListenerSet {
  constructor(emitter, {absorb: absorb=false}={}){
    this.name = `${emitter.name}{${emitter.listenerSets++}}`
    this.emitter = emitter
    this.unregistry = []
    this.absorb = absorb
  }

  static onEmitter(emitter){
    return new ListenerSet(emitter)
  }

  static absorbEmitter(emitter){
    return new ListenerSet(emitter, {absorb: true})
  }

  on(event, listener){
    this.unregistry.push(this.emitter.register(event, listener))
    return this
  }

  once(event, listener){
    this.unregistry.push(this.emitter.registerOnce(event, listener))
    return this
  }

  fwd(srcEvent, dst, dstEvent=srcEvent){
    this.unregistry.push(this.emitter.fwd(srcEvent, dst, dstEvent))
    return this
  }

  onceAndDispose(event, listener){
    let wrappedListener = (...args) => {
      this.dispose("ListenerSet.onceAndDispose").then(() => listener(...args))
    }
    this.unregistry.push(this.emitter.registerOnce(event, wrappedListener))
    return this
  }

  disposeOn(event){
    this.unregistry.push(this.emitter.registerOnce(
      event, () => {
        this.dispose("ListenerSet.disposeOn")
      }))
    return this
  }

  dispose(reason){
    this.unregistry.forEach(unregister => unregister())
    if(this.absorb){
      return this.emitter.dispose(reason)
    }else{
      return Promise.resolve()
    }
  }

}

var fusionCount = 0

class Fusion extends FusionEmitter {
  constructor(host, {secure: secure=true}={}){
    super('Fusion(${fusionCount++})')
    var self = (collectionName) => self.collection(collectionName)
    Object.setPrototypeOf(self, Object.getPrototypeOf(this))

    self.host = host
    self.secure = secure
    self.requestCounter = 0
    self.socket = new FusionSocket(host, secure)
    self.listenerSet = ListenerSet.absorbEmitter(self.socket)
      .onceAndDispose('error', (err) => self.emit('error', err, self))
      .on('connected', () => self.emit('connected', self))
      .on('disconnected', () => self.emit('disconnected', self))
    // send handshake
    self.handshakeResponse = self.socket.getPromise('connected').then(() => {
      let reqId = self.requestCounter++
      self.socket.send({request_id: reqId})
      return self.socket.getPromise(responseEvent(reqId))
    }).catch(event => {
      return self.dispose("Fusion got a Connection error")
    })
    return self
  }

  dispose(reason='Fusion object disposed'){
    return this.socket.dispose(reason).then(() => this.listenerSet.dispose(reason))
  }

  collection(collectionName){
    return new Collection(this, collectionName)
  }

  store(collection, documents, options){
    if(Array.isArray(documents[0]) && documents.length === 1 ){
      //Unwrap if a user passed an array to a spread function
      documents = documents[0]
    }
    let command = Object.assign({data: documents}, collection, options)
    return this._send(`store`, command).intoCollectingPromise('response')
  }

  remove(collection, documents){
    let command = {collection: collection, data: documents}
    return this._send('remove', command).intoCollectingPromise('response')
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
  constructor(host, secure=true){
    super(`FusionSocket(${socketCount++})`)
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
      message = JSON.stringify(message)
    }
    this._openWs.then((ws) => ws.send(message))
  }

  dispose(reason='FusionSocket disposed'){
    return this._openWs.then((ws) => ws.close(1000, reason))
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

  // Emits an event depending on new_val old_val return value is
  // whether an event was emitted
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


class MockConnection extends Fusion {
  constructor(hostString){
    super()
    this.hostString = hostString;
    this.docs = [];
    this.promises = {};
    this.emitters = {};
    this.requestCounter = 0;
  }

  send(type, data){
    //Basically, don't actually send anything just store it in an array,
    // inefficient search and no error handling but fine for mocking

    switch(type){
    case 'update':
      this.docs.forEach(function(doc, index){
        if (doc.id == data.id){
          this.data[index] = data;
        }
      });
      break;
    case 'remove':
      this.docs.forEach(function(doc, index){
        if (doc.id == data.id){
          this.data = this.data.splice(index);
        }
      });
      break;
    case 'store_replace':
    case 'store_error':
      this.docs.push(data);
      break;
    }

    return Promise.resolve(true);
  }

  _onOpen(event){
    for(let emitter of this.emitters){
      emitter.emit('reconnected', event);
    }
  }
}


class TermBase {

  constructor(fusion){
    this.fusion = fusion
  }

  subscribe(updates=true){
    // should create a changefeed query, return eventemitter
    return this.fusion.subscribe(this.query, updates)
  }

  _modifyValue(val){
    //By default, don't change the result
    return val
  }

  value(){
    // return promise with no changefeed
    return this.fusion.query(this.query).then(this._modifyValue.bind(this))
  }
}

class Collection extends TermBase {

  constructor(fusion, collectionName){
    super(fusion)
    this._collectionName = collectionName
    this.query = {collection: collectionName, field_name: 'id'}
  }

  findOne(id, {field: field='id'}={}){
    return new FindOne(this.fusion, this.query, id, field)
  }

  find(fieldName, fieldValue){
    return new Find(this.fusion, this.query, fieldName, fieldValue)
  }

  between(minVal, maxVal, field='id'){
    return new Between(this.fusion, this.query, minVal, maxVal,field)
  }

  order(field='id', ascending=true){
    return new Order(this.fusion, this.query, field, ascending)
  }

  store(...documents){
    let args = {missing: 'insert', conflict: 'replace'}
    let promise = this.fusion.store(this.query, documents, args)
    return rejectIfNoArgs('store', arguments, promise)
  }

  upsert(...documents){
    let args =  {missing: 'insert', conflict: 'update'}
    let promise = this.fusion.store(this.query, documents, args)
    return rejectIfNoArgs('upsert', arguments, promise)
  }

  insert(...documents){
    let args = {missing: 'insert', conflict: 'error'}
    let promise = this.fusion.store(this.query, documents, args)
    return rejectIfNoArgs('insert', arguments, promise)
  }

  replace(...documents){
    let args = {missing: 'error', conflict: 'replace'}
    let promise = this.fusion.store(this.query, documents, args)
    return rejectIfNoArgs('replace', arguments, promise)
  }

  update(...documents){
    let args = {missing: 'error', conflict: 'update'}
    let promise = this.fusion.store(this.query, documents, args)
    return rejectIfNoArgs('update', arguments, promise)
  }

  remove(...documents){
    documents = documents.map((doc) => {
      if(typeof doc === 'number' || typeof doc === 'string'){
        return {id: doc}
      }else{
        return doc
      }
    })
    let promise = this.fusion.remove(this._collectionName, documents)
    return rejectIfNoArgs('remove', arguments, promise)
  }
}

class Find extends TermBase {
  constructor(fusion, query, field, value){
    super(fusion)
    this._field = field
    this._value = value
    this.query = Object.assign({
      selection: {type: 'find', args: [value]},
      field_name: field
    }, query)
  }

  order(field='id', ascending=true){
    return new Order(this.fusion, this.query, field, ascending)
  }

  limit(size){
    return new Limit(this.fusion, this.query, size);
  }
}

class FindOne extends TermBase {
  constructor(fusion, query, docId, fieldName){
    super(fusion)
    this._id = docId
    this._fieldName = fieldName
    this.query = Object.assign({
      selection: {type: 'find_one', args: [docId]},
      field_name: fieldName,
    }, query)
  }

  _modifyValue(val){
    //findOne unwraps its results
    return val[0]
  }
}

class Between extends TermBase {
  constructor(fusion, query, minVal, maxVal, fieldName){
    super(fusion)
    this._minVal = minVal
    this._maxVal = maxVal
    this._field = fieldName
    this.query = Object.assign({
      selection: {type: 'between', args: [minVal, maxVal]},
      field_name: fieldName
    }, query)
  }

  limit(size){
    return new Limit(this.fusion, this.query, size);
  }
}

class Order {
  constructor(fusion, query, fieldName, ascending){
    this.fusion = fusion
    this._field = fieldName
    this.query = Object.assign({
      order: ascending ? 'ascending' : 'descending',
      field_name: fieldName
    }, query)
  }

  limit(size){
    return new Limit(this.fusion, this.query, size)
  }

  between(minVal, maxVal){
    // between is forced to have the same field as this term
    return new Between(this.fusion, this.query, minVal, maxVal, this.field)
  }
}

class Limit extends TermBase {
  constructor(fusion, query, size){
    super(fusion)
    this._size = size
    this.query = Object.assign({limit: size}, query)
  }
}

module.exports = Fusion
