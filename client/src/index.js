import EventEmitter from "events"

class Fusion {

    constructor(hostString){
        this.hostString = hostString
        this._socket = new Socket(hostString, this.classify)
        // Hack for fusion(collectionName) syntax
        self = (collectionName) => self.collection(collectionName)
        Object.setPrototypeOf(self, Object.getPrototypeOf(this))
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

    _query(path){
        return this.socket.send("QUERY", {path: path})
    }

    _store(path, document, conflict){
        if(conflict === 'replace'){
            return this.socket.send("STORE_REPLACE", {path: path, data: document})
        }else if(conflict === 'error'){
            return this.socket.send("STORE_ERROR", {path: path, data: document})
        }else{
            return Promise.reject(`value of conflict not understood: ${conflict}`)
        }
    }

    _update(path, document){
        return this.socket.send("UPDATE", {path: path, data: document})
    }

    _remove(path, id){
        return this.socket.send("REMOVE", {path: path, data: id})
    }

    _subscribe(path, updates){
        if(updates){
            return this.socket.subscribe(path)
        }else{
            //Emulate subscription with one-shot query
            var emitter = new EventEmitter()
            this.socket.send("QUERY", path).then(
                // Do we have continues etc like cursors?
                // Right now assuming we get results back as an array
                (results) => {
                    for(let result of results) {
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
        this.ws = new WebSocket(`ws://${hostString}`)
        this.ws.onmessage = this._onMessage
        this.ws.onclose = this._onClose
        this.ws.onopen = this._onOpen
        this.classifier = classifier
        this.promises = {}
        this.emitters = {}
        this.requestCounter = 0
    }

    send(type, data){
        var requestId = this.requestCounter++
        var req = {type: type, data: data, requestId: requestId}
        return new Promise((resolve, reject) =>
            this.promises[requestId] = {resolve: resolve, reject:reject})
    }

    subscribe(path){
        var requestId = this.requestCounter++
        var req = {type: "SUBSCRIBE", data: data, requestId: requestId}
        var emitter = new EventEmitter() // customize?
        this.emitters[requestId] = emitter
        return emitter
    }

    _onClose(event){
        for(let emitter of this.emitters){
            emitter.emit('disconnected', event)
        }
        // Do we do something with promises? What if we reconnect
    }

    _onOpen(event){
        for(let emitter of this.emitters){
            emitter.emit('reconnected', event)
        }
    }

    _onMessage(event){
        var resp = JSON.parse(event.data)
        if(this.promises.hasOwnProperty(resp.requestId)){
            var promise = this.promises[resp.requestId]
            delete this.promises[resp.requestId]

            if (resp.error !== undefined){
                promise.reject(resp.error)
            } else {
                promise.resolve(resp.value)
            }
        }else if(this.emitters.hasOwnProperty(resp.requestId)){
            var emitter = this.emitters[resp.requestId]
            if(resp.error !== undefined){
                emitter.emit("error", resp.error)
            }else{
                emitter.emit(this.classifier(resp.data), resp.value)
            }
        }else{
            console.error(`Unrecognized response: ${event}`)
        }
    }
}


class TermBase {

    constructor(fusion){
        this.fusion = fusion
    }

    subscribe(updates: true){
        // should create a changefeed query, return eventemitter
        return this.fusion._subscribe(this.path)
    }

    value(){
        // return promise with no changefeed
        return this.fusion._value(this.path)
    }
}

class Collection {

    constructor(fusion, collectionName){
        this.collectionName = collectionName
        this.path = {collection: collectionName}
        this.fusion = fusion
    }

    findOne(id){
        return new findOne(this.fusion, this.path, id)
    }

    find(fieldName, fieldValue){
        return new Find(this.fusion, this.path, fieldName, fieldValue)
    }

    between(minVal, maxVal, field: 'id'){
        return new Between(this.fusion, this.path, minVal, maxVal,field)
    }

    order(field: 'id', descending: false){
        return new Order(this.fusion, this.path, field, descending)
    }

    store(document, conflict: 'replace'){
        return this.fusion._store(this.path, document, conflict)
    }

    update(document){
        return this.fusion._update(this.path, document)
    }

    remove(document){
        return this.fusion._remove(this.path, document)
    }
}

class Find extends TermBase {
    constructor(fusion, path, field, value){
        super(fusion)
        this.field
        this.value = value
        this.path = Object.assign({find: [field, value]}, path)
    }

    order(field: 'id', descending: false){
        return new Order(this.fusion, this.path, field, descending)
    }

    limit(size){
        return new Limit(this.fusion, this.path, size);
    }
}

class FindOne extends TermBase {
    constructor(fusion, path, docId){
        super(fusion)
        this.id = docId
        this.path = Object.assign({findOne: docId}, path)
    }
}

class Between extends TermBase {
    constructor(fusion, path, minVal, maxVal, field){
        super(fusion)
        this.minVal = minVal
        this.maxVal = maxVal
        this.field = field
        this.path = Object.assign({between: [minVal, maxVal, field]}, path)
    }

    limit(size){
        return new Limit(this.fusion, this.path, size);
    }
}

class Order {
    constructor(fusion, path, field, descending){
        this.fusion = fusion
        this.field = field
        this.direction = direction
        this.path = Object.assign({order: [field, descending]}, path)
    }

    limit(size){
        return new Limit(this.fusion, this.path, size)
    }

    between(minVal, maxVal){
        // between is forced to have the same field as this term
        return new Between(this.fusion, this.path, minVal, maxVal, this.field)
    }
}

class Limit extends TermBase {
    constructor(fusion, path, size){
        super(fusion)
        this.size = size
        this.path = Object.assign({limit: size}, path)
    }
}
