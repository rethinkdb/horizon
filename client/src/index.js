const EventEmitter = require('events').EventEmitter

const PROTOCOL_VERSION = 'rethinkdb-fusion-v0'

function oneOf(val, ...values){
    return (new Set(values)).has(val)
}

function responseEvent(id){
    return `response:${id}`
}

class FusionEmitter extends EventEmitter {
    // Returns a function that can be called to remove the listener
    // Otherwise works the same as 'on' for the underlying socket
    register(event, listener){
        this.on(event, listener)
        return () => this.removeListener(event, listener)
    }

    // Similar to `register` but wraps `once` instead of `on`
    registerOnce(event, listener){
        this.once(event, listener)
        return () => this.removeListener(event, listener)
    }

    //Forwards events from the current emitter to another emitter,
    //returning an unregistration function
    fwd(srcEvent, dst, dstEvent=srcEvent){
        return this.register(srcEvent, (...args) => dst.emit(dstEvent, ...args))
    }

    // A promise that accepts when the given event occurs, and rejects
    // when an 'error' event is raised
    toPromise(event){
        console.debug(`Promise will accept on ${event} and reject on 'error'`)
        return new Promise((resolve, reject) => {
            (new ListenerSet(this))
                .on(event, resolve)
                .on('error', reject)
        })
    }
}

// Handles hooking up a group of listeners to a FusionEmitter, and
// removing them all when certain events occur
class ListenerSet {
    constructor(emitter){
        this.emitter = emitter
        this.unregistry = []
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
    }

}

class Fusion extends FusionEmitter {
    constructor(host, secure=true){
        super()
        var self = (collectionName) => self.collection(collectionName)
        Object.setPrototypeOf(self, Object.getPrototypeOf(this))

        self.host = host
        self.secure = secure
        self.requestCounter = 0
        self.socket = new FusionSocket(host, secure)
        self.socket.fwd('connected', self)
        self.socket.fwd('disconnected', self)
        self.socket.fwd('error', self, 'error')
        // send handshake
        self.handshakenSocket = self.socket.toPromise('connected').then(() => {
            console.debug("Sending handshake {}")
            self.socket.send({})
            return self.socket.toPromise('handshake-complete')
        }).then(handshake => {
            console.debug("received handshake: ", handshake)
        }).catch((event) => console.debug('Got a connection error:', event))
        return self
    }

    close(){
        this.socket.close('Fusion object closed')
    }

    collection(collectionName){
        return new Collection(this, collectionName)
    }

    store(collection, document, conflict){
        let command = Object.assign({data: document}, collection)
        if(oneOf(conflict, 'replace', 'error', 'update')){
            return this._send(`store_${conflict}`, command)
        }else{
            return Promise.reject(`value cant store with conflict argument: ${conflict}`)
        }
    }

    query(data){
        return this._send('query', data).collectingPromise('response')
    }

    remove(collection, document){
        return this._send('remove', {collection: collection, data: document})
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
            console.debug(`sending: ${JSON.stringify(req)}`)
            this.socket.send(req)
        })
        return new RequestEmitter(requestId, this.socket)
    }

    // Subscription queries, only handles returning an emitter
    _subscribe(query){
        let requestId = this.requestCounter++
        let req = {type: 'subscribe', options: query, request_id: requestId}
        console.debug('Sending subscription request', req)
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
                console.debug("Socket connected", event)
                this.emit('connected', event)
                resolve(this._ws)
            }
            this._ws.onerror = (event) => {
                console.debug("Socket error", event)
                this.emit('error', event)
                reject(event)
            }
            this._ws.onclose = (event) => {
                console.debug("Socket disconnected", event)
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
                console.debug("Got error:", event)
                this.emit({error: data.request_id}, data)
            }else{
                console.debug("Got message for request_id:", data.request_id, data)
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

    close(reason){
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
        console.debug("Creating emitter for request_id", requestId)
        this.fusion = fusion
        this.requestId = requestId
        this.remoteListeners = new ListenerSet(this.fusion)

        //Forwards on fusion events to this emitter's listeners
        this.remoteListeners
            .fwd('connected', this)
            .fwd('disconnected', this)
            .fwd({error: requestId}, this, 'error')
            .on(responseEvent(requestId), (response) => {
                console.debug("Emitter got response:", response)
                if(Array.isArray(response.data)){
                    response.data.forEach(changeObj => {
                        if(changeObj.new_val !== null && changeObj.old_val !== null){
                            this.emit('changed', changeObj.new_val, changeObj.old_val)
                        }else if(changeObj.new_val !== null && changeObj.old_val === null){
                            this.emit('added', changeObj.new_val)
                        }else if(changeObj.new_val === null && changeObj.old_val !== null){
                            this.emit('removed', changeObj.old_val)
                        }else{
                            this.emit('response', response.data)
                        }
                    })
                }else if(response.data !== undefined){
                    this.emit("response", response.data)
                }
                if(response.state === 'synced'){
                    console.debug("emitting synced for", response.request_id)
                    this.emit('synced')
                }else if(response.state === 'complete'){
                    console.debug("emitting complete for", response.request_id)
                    this.emit('complete')
                }
            })
            .cleanupOn('error')
        //Add a hook for when the 'change' event is added. If the
        //change isn't being listened for, added/removed events will
        //be emitted for both
    }

    //Create a promise from this emitter, accepts on the given event
    //and rejects on the second event which defaults to 'error'
    toPromise(acceptEvent, rejectEvent='error'){
        return new Promise((resolve, reject) => {
            (new ListenerSet(this))
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
        return new Promise((resolve, reject) => {
            let values = [];
            (new ListenerSet(this))
                .on(addEvent, item => values.push(item))
                .onceAndCleanup(completeEvent, () => resolve(values))
                .cleanupOn('error')
        })
    }

    close(){
        //TODO: send some message to the server to stop this requestId
        this.remoteListeners.cleanup()
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
        return this.fusion.remove(this.query, document)
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
