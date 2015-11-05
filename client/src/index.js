const EventEmitter = require('events').EventEmitter

const PROTOCOL_VERSION = 'rethinkdb-fusion-v0'

function classifyChange(changeObj){
    if(changeObj.new_val !== null && changeObj.old_val !== null){
        return ['changed', changeObj.new_val, changeObj.old_val]
    }else if(changeObj.new_val !== null && changeObj.old_val === null){
        return ['added', changeObj.new_val]
    }else if(changeObj.new_val === null && changeObj.old_val !== null){
        return ['removed', changeObj.old_val]
    }else{
        return ['unknown', changeObj.new_val, changeObj.old_val]
    }
}

function oneOf(val, ...values){
    return (new Set(values)).has(val)
}

export class Fusion {

    constructor(hostString, secure=true, connectionClass=Connection){
        console.debug('Constructing fusion object')

        var self = (collectionName) => self.collection(collectionName)

        Object.setPrototypeOf(self, Object.getPrototypeOf(this))

        self.hostString = hostString
        self._conn = new connectionClass(hostString, secure)
        return self
    }
    collection(collectionName){
        return new Collection(this, collectionName)
    }

    _query(query){
        // determine if the query is a find_one
        return this._conn.send('query', query)
    }

    _store(collection, document, conflict){
        let command = Object.assign({data: document}, collection)
        if(oneOf(conflict, 'replace', 'error', 'update')){
            return this._conn.send(`store_${conflict}`, command)
        }else{
            return Promise.reject(`value cant store with conflict argument: ${conflict}`)
        }
    }

    _remove(collection, document){
        return this._conn.send('remove', {collection: collection, data: document})
    }

    _subscribe(query, updates){
        if(updates){
            return this._conn.subscribe(query)
        }else{
            return this._conn.send('query', query, true)
        }
    }

}

class FusionSocket extends EventEmitter {
    // Wraps native websockets in an EventEmitter, and deals with some
    // simple protocol level things like serializing from/to JSON, and
    // emitting events on request_ids
    constructor(host, secure=true){
        super()
        let hostString = (secure ? 'wss://' : 'ws://') + host
        this._ws = new WebSocket(hostString, PROTOCOL_VERSION)
        this._ws.onopen = (event) => this.emit('connected', event)
        this._ws.onerror = (event) => this.emit('socketError', event)
        this._ws.onclose = (event) => this.emit('disconnected', event)
        this._ws.onmessage = (event) => {
            console.log("Got raw socket event", event)
            let data = JSON.parse(event.data)
            if(data.request_id === undefined){
                this.emit('handshake-complete', data)
            }else if(data.error !== undefined){
                this.emit({error: data.request_id}, data)
            }else{
                this.emit({response: data.request_id}, data)
            }
        }
    }

    send(message){
        if(typeof message !== 'string'){
            message = JSON.stringify(message)
        }
        if(this._ws.readyState !== WebSocket.OPEN){
            this.once('connected', (event) => this._ws.send(message))
        }else{
            this._ws.send(message)
        }
    }

    close(code, reason){
        this._ws.close(code, reason)
    }

    toPromise(resolveEvent, rejectEvent='disconnected'){
        return new Promise((resolve, reject) => {
            var resolver = (event) => {
                this.removeListener(rejectEvent, rejecter)
                    .removeListener('socketError', rejecter)
                    .removeListener('disconnected', rejecter)
                resolve(event)
            }
            var rejecter = (event) => {
                this.removeListener(resolveEvent, resolver)
                    .removeListener('socketError', rejecter)
                    .removeListener('disconnected', rejecter)
                reject(event)
            }
            this.once(resolveEvent, resolver)
                .once(rejectEvent, rejecter)
            if(rejectEvent !== 'socketError'){
                this.once('socketError', rejecter)
            }
        })
    }

    responseEmitter(requestId, responseClassifier){
        let emitter = new CloseableEmitter(this, requestId)
        var removeAllListeners = () => {
            this.removeListener({response: requestId}, responder)
                .removeListener({error: requestId}, errorer)
                .removeListener('socketError', errorer)
                .removeListener('disconnected', errorer)
        }
        var responder = (response) => {
            let eventArgs = responseClassifier(response)
            emitter.emit(...eventArgs)
        }
        var errorer = (event) => {
            removeAllListeners()
            emitter.emit('error', event)
        }
        this.on({response: requestId}, responder)
        this.once({error: requestId}, errorer)
        this.once('socketError', errorer)
        this.once('disconnected', errorer)
        return emitter
    }

    responsePromise(requestId){
        // Listens for all responses to a request_id, adding them to
        // an internal array. Once a response comes in that has state:
        // 'complete', it resolves the promise with all of the values.
        // The promise is rejected if an error happens for the request id
        // or the socket
        let values = []
        return new Promise((resolve, reject) => {
            var removeAllListeners = () => {
                this.removeListener({response: requestId}, resolver)
                    .removeListener({error: requestId}, rejecter)
                    .removeListener('socketError', rejecter)
                    .removeListener('disconnected', rejecter)
            }
            var resolver = (response) => {
                values.push(...response.data)
                if(response.state === 'complete'){
                    removeAllListeners()
                    resolve(values)
                }
            }
            var rejecter = (response) => {
                removeAllListeners()
                reject(response)
            }
            this.on({response: requestId}, resolver)
                .on({error: requestId}, rejecter)
                .on('socketError', rejecter)
                .on('disconnected', rejecter)
        })
    }
}

class CloseableEmitter extends EventEmitter {
    constructor(requestId, socket){
        super()
        this.socket = socket
        this.requestId = requestId
        // TODO listenerAdded, when 'changed' is in, do something different
    }
}

class Connection {
    constructor(host, secure=true){
        // send handshake
        this.host = host
        this.secure = secure
        this.requestCounter = 0
        this.socket = new FusionSocket(host, secure)
        this.socket.toPromise('connected').then(() => {
            console.log("Sending handshake")
            this.socket.send({})
            return this.socket.toPromise('handshake-complete')
        }).then((handshake) => {
            // TODO: check handshake result
            console.debug('Handshake received.')
        }).catch((event) => {
            console.debug('Got a connection error: ', event)
        })
    }

    send(type, data, forEmitter=false){
        let requestId = this.requestCounter++
        let req = {type: type, options: data, request_id: requestId}
        console.debug('sending: ', req)
        this.socket.send(req)
        if(forEmitter){
            return this.socket.responseEmitter(requestId, classifyChange)
        }else{
            return this.socket.responsePromise(requestId)
        }
    }

    subscribe(query){
        let requestId = this.requestCounter++
        let req = {type: 'subscribe', options: query, request_id: requestId}
        console.debug('Sending subscription request', req)
        this.socket.send(req)

        let emitter = new CloseableEmitter(requestId, this.socket)
        let responder = (response) => {
            let eventArgs = classifyChange(response.data)
            emitter.emit(...eventArgs)
            if(response.state === 'synced'){
                emitter.emit('synced')
            }
        }
        let errorer = (event) => {
            this.socket.removeListener({response: requestId}, responder)
                .socket.removeListener({error: requestId}, errorer)
                .socket.removeListener('socketError', errorer)
            emitter.emit('error', event)
        }
        this.socket.on({response: requestId}, responder)
        this.socket.once({error: requestId}, errorer)
        this.socket.once('socketError', errorer)
        return emitter
    }
}

export class MockSocket extends Connection {
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
        return this.fusion._subscribe(this.query, updates)
    }

    value(){
        // return promise with no changefeed
        return this.fusion._query(this.query)
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
        return this.fusion._store(this.query, document, conflict)
    }

    update(document){
        return this.fusion._store(this.query, document, 'update')
    }

    remove(document){
        if(typeof document === 'number' || typeof document === 'string'){
            document = {id: document}
        }
        return this.fusion._remove(this.query, document)
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
