import EventEmitter from "events"

const PROTOCOL_VERSION = 'rethinkdb-fusion-v0'

export class Fusion {

    constructor(hostString){
        console.log("Constructing fusion object")
        self = (collectionName) => self.collection(collectionName)
        Object.setPrototypeOf(self, Object.getPrototypeOf(this))
        if (typeof hostString == "object" && hostString.mock == true){
            console.log("mocking the socket")
            self.hostString = "mock"
            self._socket = new MockSocket(hostString, this.classify)
        } else {
            console.log("Real websocket")
            self.hostString = hostString
            self._socket = new Socket(hostString, this.classify)
        }
        return self
    }

    collection(name){
        //Check if collection exists?? Nope, EAFP let server handle it.
        return new Collection(this, name)
    }

    classify(response){
        // response -> responseType
        // this might need to go in another class and be given to this class
        if(response.new_val !== null && response.old_val !== null){
            return 'changed'
        }else if(response.new_val !== null && response.old_val === null){
            return 'added'
        }else if(response.new_val === null && response.old_val !== null){
            return 'removed'
        }else if(response.state === 'synced'){
            return 'synced'
        }else{
            return 'unknown'
        }
    }

    _query(query){
        console.log("Enqueueing query: ", JSON.stringify(query))
        return this._socket.send("query", query)
    }

    _store(collection, document, conflict){
        let command = Object.assign({data: document}, collection)
        if(conflict === 'replace'){
            return this._socket.send("store_replace", command)
        }else if(conflict === 'error'){
            return this._socket.send("store_error", command)
        }else if(conflict === 'update'){
            return this._socket.send("store_update", command)
        }else{
            return Promise.reject(`value cant store with conflict argument: ${conflict}`)
        }
    }

    _remove(collection, document){
        return this._socket.send("remove", {collection: collection, data: document})
    }

    _subscribe(query, updates){
        if(updates){
            return this._socket.subscribe(query)
        }else{
            //Emulate subscription with one-shot query
            var emitter = new EventEmitter()
            this._socket.send("query", query).then(
                // Do we have continues etc like cursors?
                // Right now assuming we get results back as an array
                (results) => {
                    for(let result of results){
                        emitter.emit("added", {new_val: result, old_val: null})
                    }
                }
            )
            return emitter
        }
    }

}

class Socket {
    constructor(hostString, classifier){
        // send handshake
        this.classifier = classifier
        this.promises = new Map()
        this.emitters = new Map()
        this.requestCounter = 0
        this.wsPromise = (new Promise((resolve, reject) => {
            console.log("Creating websocket")
            let ws = new WebSocket("ws://"+hostString, PROTOCOL_VERSION)
            ws.onopen = (event) => resolve(ws)
            ws.onerror = (event) => reject(event)
        })).then((ws) => {
            console.log("Websocket created, sending handshake")
            let handshake = {}
            return new Promise((resolve, reject) => {
                // TODO: check handshake response once it has something in it
                ws.onmessage = (handshakeResponse) => {
                    console.log("Received handshake response:", JSON.parse(handshakeResponse.data))
                    resolve(ws)
                }
                ws.onerror = (event) => {
                    console.log("Received an error on websocket", handshakeResponse)
                    reject(event)
                }
                ws.send(JSON.stringify(handshake))
            })
        }).then((ws) => {
            console.log("Handshake received. Binding message handlers")
            ws.onmessage = this._onMessage.bind(this)
            ws.onclose = this._onClose.bind(this)
            ws.onopen = this._onOpen.bind(this)
            ws.onerror = this._onError.bind(this)
            return ws
        }).catch((event) => {
            console.log("Got a connection error: ", event)
        })
    }

    send(type, data){
        var requestId = this.requestCounter++
        var req = {type: type, options: data, request_id: requestId}
        this.wsPromise.then((ws) => {
            console.log("sending: ", JSON.stringify(req))
            ws.send(JSON.stringify(req))
        })
        return new Promise((resolve, reject) => {
            this.promises.set(requestId, {resolve: resolve, reject: reject})
        })
    }

    subscribe(query){
        console.log("subscribing")
        var requestId = this.requestCounter++
        var req = {type: "subscribe", options: data, request_id: requestId}
        this.wsPromise.then((ws) => ws.send(JSON.stringify(req)))
        var emitter = new EventEmitter() // customize?
        this.emitters.set(requestId, emitter)
        return emitter
    }

    _onClose(event){
        console.log(`Got a close event. Reason: ${event.reason}`)
        Object.keys(this.emitters).forEach((requestId) => {
            this.emitters.get(requestId).emit('disconnected', event)
        })
        // Do we do something with promises? What if we reconnect
    }

    _onError(event){
        // TODO: What to do on websocket level errors?
        console.log("Error received from websocket:", event)
    }

    _onOpen(event){
        Object.keys(this.emitters).forEach((requestId) => {
            this.emitters.get(requestId).emit('reconnected', event)
        })
    }

    _onMessage(event){
        console.log("Got a new message on the socket. Emitters is", this.emitters, "and promises is", this.promises)
        var resp = JSON.parse(event.data)
        if(this.promises.has(resp.request_id)){
            console.log(`Found request id ${resp.request_id} in the emitters cache`)
            let promise = this.promises.get(resp.request_id)

            if (resp.error !== undefined){
                promise.reject(resp.error)
            } else {
                if(resp.result !== undefined){
                    promise.resolve(resp.result)
                }else if(resp.data !== undefined){
                    promise.resolve(resp.data)
                }else{
                }
            }
        }else if(this.emitters.has(resp.request_id)){
            console.log(`Found request id ${resp.request_id} in the emitters cache`)
            let emitter = this.emitters.get(resp.request_id)
            if(resp.error !== undefined){
                emitter.emit("error", resp.error_code, resp.error)
            }else if(resp.result !== undefined){
                emitter.emit(resp.result)
            }else{
                emitter.emit(this.classifier(resp.data), resp.data)
                if(resp.state === 'synced'){
                    emitter.emit('synced')
                }else if(resp.state === 'complete'){
                    emitter.emit('end')
                }
            }
        }else{
            console.log("Didn't find request id ", resp.request_id, " in emitters or promises", resp)
        }
    }
}

class MockSocket extends Socket {
  constructor(hostString, classifier){
    super()
    this.hostString = hostString;
    this.docs = [];
    this.classifier = classifier;
    this.promises = {};
    this.emitters = {};
    this.requestCounter = 0;
  }

  send(type, data){
      //Basically, don't actually send anything just store it in an array,
      // inefficient search and no error handling but fine for mocking

      switch(type){
        case "update":
          this.docs.forEach(function(doc, index){
            if (doc.id == data.id){
              this.data[index] = data;
            }
          });
          break;
        case "remove":
          this.docs.forEach(function(doc, index){
            if (doc.id == data.id){
              this.data = this.data.splice(index);
            }
          });
          break;
        case "store_replace":
        case "store_error":
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

    subscribe(updates: true){
        // should create a changefeed query, return eventemitter
        return this.fusion._subscribe(this.query)
    }

    unsubscribe(updates: true){
        throw new Exception("Not implemented")
    }

    value(){
        // return promise with no changefeed
        return this.fusion._query(this.query)
    }
}

class Collection extends TermBase {

    constructor(fusion, collectionName){
        super(fusion)
        this.collectionName = collectionName
        this.query = {collection: collectionName}
    }

    findOne(id){
        return new FindOne(this.fusion, this.query, id)
    }

    find(fieldName, fieldValue){
        return new Find(this.fusion, this.query, fieldName, fieldValue)
    }

    between(minVal, maxVal, field: 'id'){
        return new Between(this.fusion, this.query, minVal, maxVal,field)
    }

    order(field: 'id', ascending: true){
        return new Order(this.fusion, this.query, field, ascending)
    }

    store(document, conflict: 'replace'){
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
        this.field
        this.value = value
        this.query = Object.assign({
            selection: {type: 'find', args: [value]},
            field_name: field
        }, query)
    }

    order(field: 'id', ascending: true){
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
            selection: {type: "find_one", args: [docId]}
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
            selection: {type: "between", args: [minVal, maxVal]},
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
            order: ascending ? "ascending" : "descending",
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
        this.size = size
        this.query = Object.assign({limit: size}, query)
    }
}
