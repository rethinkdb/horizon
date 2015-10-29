import EventEmitter from "events";

class Fusion {

    constructor(hostString){
        this.hostString = hostString;
        this._socket = new Socket(hostString);
        // Hack for fusion(collectionName) syntax
        self = (collectionName) => self.collection(collectionName)
        self.__proto__ = this.__proto__
        return self
    }

    collection(name){
        //Check if collection exists?? Nope, EAFP let server handle it.
        return new Collection(this, name)
    }

    _query(path) {
        return this.socket.send("QUERY", {path: path})
    }

    _store(path, document) {
        return this.socket.send("STORE", {path: path, data: document});
    }

    _update(path, document) {
        return this.socket.send("UPDATE", {path: path, data: document});
    }

    _remove(path, id) {
        return this.socket.send("REMOVE", {path: path, data: id});
    }

    _subscribe(path) {
        return this.socket.subscribe(path)
    }

}

class Socket {
    constructor(hostString) {
        this.ws = new WebSocket(connection_string);
        this.ws.onmessage = this._onMessage;
        this.ws.onclose = this._onClose;
        this.ws.onopen = this._onOpen;
        this.promises = {};
        this.emitters = {};
        this.requestCounter = 0;
    }

    send(type, data) {
        var requestId = this.requestCounter++;
        var req = {type: type, data: data, requestId: requestId}
        return new Promise((resolve, reject) =>
            this.promises[requestId] = {resolve: resolve, reject:reject})
    }

    subscribe(path) {
        var requestId = this.requestCounter++;
        var req = {type: "SUBSCRIBE", data: data, requestId: requestId};
        var emitter = new EventEmitter() // customize?
        this.emitters[requestId] = emitter;
        return emitter;
    }

    _onClose(event) {
        for (emitter of this.emitters) {
            emitter.emit('disconnected', event)
        }
        // Do we do something with promises? What if we reconnect
    }

    _onOpen(event) {
        for(emitter of this.emitters) {
            emitter.emit('reconnected', event)
        }
    }

    _onMessage(event){
        var resp = JSON.parse(event.data);
        if(this.promises.hasOwnProperty(resp.requestId)){
            var promise = this.promises[resp.requestId];
            delete this.promises[resp.requestId]

            if (resp.error !== undefined){
                promise.reject(resp.error);
            } else {
                promise.resolve(resp.value);
            }
        }else if(this.emitters.hasOwnProperty(resp.requestId)){
            var emitter = this.emitters[resp.requestId];
            if(resp.error !== undefined){
                emitter.emit("error", resp.error);
            }else{
                emitter.emit(classify(resp.data), resp.value);
            }
        }else{
            console.error(`Unrecognized response: ${event}`)
        }
    }

    classify(response) {
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
}

class TermBase {

    constructor(fusion) {
        this.fusion = fusion;
    }

    subscribe(updates: true){
        // should create a changefeed query, return eventemitter
        return this.fusion._subscribe(this.path);
    }

    value() {
        // return promise with no changefeed
        return this.fusion._value(this.path)
    }
}

class Collection {

    constructor(fusion, collectionName){
        this.collectionName = collectionName;
        this.fusion = fusion;
    }

    findOne(id){
        return new findOne(this.fusion, this.collectionName, id);
    }

    find(fieldName, fieldValue) {
        return new Find(this.fusion, this.collectionName, fieldName, fieldValue);
    }

    between(minVal, maxVal, field: 'id') {
        return new Between(this.fusion, this.collectionName, minVal, maxVal,field);
    }

    ordered(field: 'id') {
        return new Ordered(this.fusion, this.collectionName, field);
    }

    store(document) {
        this.fusion._store(path, document)
    }

    update(document) {
        this.fusion._update(path, document)
    }

    remove(document) {
        this.fusion._remove(path, document)
    }
}


class FindOne extends TermBase {
    constructor(fusion, path, docId) {
        super(fusion);
        this.id = docId;
        this.path = `${path}/findOne:${docId}`;
    }
}

class Find extends TermBase {
    constructor(fusion, path, field, value) {
        super(fusion);
        this.field
        this.value = value
        this.path = `${path}/find:${field}:${value}`
  }
}


class Between extends TermBase {
    constructor(fusion, path, minVal, maxVal, field) {
        super(fusion)
        this.minVal = minVal
        this.maxVal = maxVal
        this.field = field
        this.path = `${path}/between:${minVal}:${maxVal}:${field}`
    }
}

class Ordered extends TermBase {
    constructor(fusion, path, field) {
        super(fusion)
        this.field = field;
        this.path = `${path}/ordered:${field}`
    }

    limit(num) {
        return new Limit(this.fusion, this.path, num)
    }
}

class Limit extends TermBase {
    constructor(fusion, path, field, num) {
        super(fusion)
        this.field = field
        this.num = num
        this.path = `${path}/limit:${field}:${num}`
    }
}
