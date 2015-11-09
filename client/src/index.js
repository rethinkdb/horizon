require('babel-polyfill')
const EventEmitter = require('events').EventEmitter

const PROTOCOL_VERSION = 'rethinkdb-fusion-v0'

function oneOf(val, ...values){
  return (new Set(values)).has(val)
}

function responseEvent(id){
  return `response:${id}`
}
function errorEvent(id){
  return `error:${id}`
}

class FusionEmitter extends EventEmitter {
  // Returns a function that can be called to remove the listener
  // Otherwise works the same as 'on' for the underlying socket
  register(event, listener){
    this.on(event, listener)
    console.debug(`Listeners for ${event} up to ${this.listenerCount(event)}`)
    return () => {
      this.removeListener(event, listener)
      console.debug(`Listeners for ${event} down to ${this.listenerCount(event)}`)
    }
  }

  // Similar to `register` but wraps `once` instead of `on`
  registerOnce(event, listener){
    this.once(event, listener)
    console.debug(`Listeners for ${event} up to ${this.listenerCount(event)}`)
    return () => {
      this.removeListener(event, listener)
      console.debug(`Listeners for ${event} down to ${this.listenerCount(event)}`)
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
    console.debug("getPromise accept=", acceptEvent, "reject=", rejectEvent)
    let listenerSet = ListenerSet.onEmitter(this)
    console.debug("listenerset created")
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
    console.debug("making promise")
    return new Promise((resolve, reject) => {
      listenerSet
        .onceAndCleanup(acceptEvent, resolve)
        .onceAndCleanup(rejectEvent, reject)
    })
  }

  // Listens for all 'added' events, adding them to an
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
        .on(addEvent, item => values.push(item))
        .onceAndCleanup(completeEvent, () => resolve(values))
        .cleanupOn('error')
    })
  }

  dispose(){
    this.remoteListeners.cleanup()
  }
}

// Handles hooking up a group of listeners to a FusionEmitter, and
// removing them all when certain events occur
class ListenerSet {
  constructor(emitter, {absorb: absorb=false}={}){
    console.debug("Creating listenerSet ", absorb)
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

  onceAndCleanup(event, listener){
    let wrappedListener = (...args) => {
      listener(...args)
      this.cleanup()
    }
    this.unregistry.push(this.emitter.registerOnce(event, wrappedListener))
    return this
  }

  cleanupOn(event){
    this.unregistry.push(this.emitter.registerOnce(event, this.cleanup.bind(this)))
    return this
  }

  cleanup(){
    this.unregistry.forEach(unregister => unregister())
    if(this.absorb){
      this.emitter.dispose()
    }
  }

}

class Fusion extends FusionEmitter {
  constructor(host, {secure: secure=true}={}){
    super()
    var self = (collectionName) => self.collection(collectionName)
    Object.setPrototypeOf(self, Object.getPrototypeOf(this))
    console.log("1")

    self.host = host
    self.secure = secure
    self.requestCounter = 0
    self.socket = new FusionSocket(host, secure)
    self.listenerSet = ListenerSet.absorbEmitter(self.socket)
      .fwd('connected', self)
      .fwd('disconnected', self)
      .fwd('error', self, 'error')
    console.log("2")
    // send handshake
    self.handshakenSocket = self.socket.getPromise('connected').then(() => {
      console.log("connected")
      self.socket.send({})
      return self.socket.getPromise('handshake-complete')
    }).then(() => {
      console.log("got handshake")
      return true
    }).catch(event => console.error('Got a connection error:', event))
    console.log("3")
    return self
  }

  dispose(){
    this.listenerSet.dispose('Fusion object disposed')
  }

  collection(collectionName){
    return new Collection(this, collectionName)
  }

  store(collection, document, conflict){
    let command = Object.assign({data: document}, collection)
    if(oneOf(conflict, 'replace', 'error', 'update')){
      return (this._send(`store_${conflict}`, command)
              .intoCollectingPromise('response'))
    }else{
      return Promise.reject(`Bad argument for conflict: ${conflict}`)
    }
  }

  query(data){
    return this._send('query', data).intoCollectingPromise('response')
  }

  remove(collection, document){
    let command = {collection: collection, data: document}
    return this._send('remove', command).intoCollectingPromise('response')
  }

  subscribe(query, updates=true){
    if(updates){
      return this._subscribe(query)
    }else{
      return this._send('query', query)
    }
  }

  _send(type, data){
    let requestId = this.requestCounter++
    let req = {type: type, options: data, request_id: requestId}
    this.handshakenSocket.then(() => {
      this.socket.send(req)
    })
    return new RequestEmitter(requestId, this.socket)
  }

  // Subscription queries, only handles returning an emitter
  _subscribe(query){
    let requestId = this.requestCounter++
    let req = {type: 'subscribe', options: query, request_id: requestId}
    this.handshakenSocket.then(() => this.socket.send(req))
    return new RequestEmitter(requestId, this.socket)
  }

}

class FusionSocket extends FusionEmitter {
  // Wraps native websockets in an EventEmitter, and deals with some
  // simple protocol level things like serializing from/to JSON, and
  // emitting events on request_ids
  constructor(host, secure=true){
    super()
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
        // Do validation / use user_id
        this.emit('handshake-complete', data)
      }else if(data.error !== undefined){
        this.emit(errorEvent(data.request_id), data)
      }else{
        this.emit(responseEvent(data.request_id), data)
      }
    }
  }

  send(message){
    if(typeof message !== 'string'){
      message = JSON.stringify(message)
    }
    return this._openWs.then((ws) => ws.send(message))
  }

  dispose(reason){
    super.dispose()
    this._openWs.then((ws) => ws.close(1002, reason))
  }

}

// These are created for requests, will only get messages for the
// particular request id. Has extra methods for closing the request,
// and for creating promises that resolve or reject based on events
// from this emitter
class RequestEmitter extends FusionEmitter {
  constructor(requestId, fusion){
    super()
    this.fusion = fusion
    this.requestId = requestId
    this.remoteListeners = ListenerSet.onEmitter(this.fusion)

    //Forwards on fusion events to this emitter's listeners
    this.remoteListeners
      .fwd('connected', this)
      .fwd('disconnected', this)
      .fwd(errorEvent(requestId), this, 'error')
      .on(responseEvent(requestId), (response) => {
        if(Array.isArray(response.data)){
          response.data.forEach(changeObj => {
            if(!this._emitChangeEvent(changeObj)){
              this.emit('response', response.data)
            }
          })
        }else if(response.data !== undefined){
          this.emit("response", response.data)
        }
        if(response.state === 'synced'){
          this.emit('synced')
        }else if(response.state === 'complete'){
          this.emit('complete')
        }
      }).cleanupOn('error')
  }

  // Emits an event depending on new_val old_val return value is
  // whether an event was emitted
  _emitChangeEvent(changeObj){
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
  dispose(){
    super.dispose()
    //TODO: send some message to the server to stop this requestId
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

  value(){
    // return promise with no changefeed
    return this.fusion.query(this.query)
  }
}

class Collection extends TermBase {

  constructor(fusion, collectionName){
    super(fusion)
    this._collectionName = collectionName
    this.query = {collection: collectionName}
  }

  findOne(id){
    return new FindOne(this.fusion, this.query, id)
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

  store(document, conflict='replace'){
    return this.fusion.store(this.query, document, conflict)
  }

  update(document){
    return this.fusion.store(this.query, document, 'update')
  }

  remove(document){
    if(typeof document === 'number' || typeof document === 'string'){
      document = {id: document}
    }
    return this.fusion.remove(this._collectionName, document)
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
  constructor(fusion, query, docId){
    super(fusion)
    this.id = docId
    this.query = Object.assign({
      selection: {type: 'find_one', args: [docId]}
    }, query)
  }
}

class Between extends TermBase {
  constructor(fusion, query, minVal, maxVal, field){
    super(fusion)
    this.minVal = minVal
    this.maxVal = maxVal
    this.field = field
    this.query = Object.assign({
      selection: {type: 'between', args: [minVal, maxVal]},
      field_name: field
    }, query)
  }

  limit(size){
    return new Limit(this.fusion, this.query, size);
  }
}

class Order {
  constructor(fusion, query, field, ascending){
    this.fusion = fusion
    this.field = field
    this.direction = direction
    this.query = Object.assign({
      order: ascending ? 'ascending' : 'descending',
      field_name: field
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
