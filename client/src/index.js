import EventEmitter from "events";

class Fusion {

  constructor(host_string){
      this.host_string = host_string;

  }

  // connect(host_string){
  //     this.ws = new WebSocket(host_string);
  // }

  table(table_name){
    //Check if table exists?? Nope, EAFP let server handle it.
    return new Table(this, table_name)
  }

}

class Table {

  constructor(fusion, table_name){
    this.table_name = table_name;
    this.fusion = fusion;
    this.connection_string = `${fusion.host_string}/${table_name}`;

    this.ws = new WebSocket(connection_string);
    this.ws.onmessage = this._onMessage;

    // request_id => {resolve: function, reject: function }
    this.outstanding = {};

    this.eventListener; 

    this.requestCounter = 0;
  }

  _onMessage(event){
    var resp = JSON.parse(event.data);
    var promise = this.outstanding[resp.request_id];

    if (resp.error !== undefined){
      promise.reject(resp.error);
    } else {
      promise.resolve(resp.value);
    }
  }

  _createRequestJSON(id, type){
    return JSON.stringify({
      "id": id,
      "type": type,
      request_id: this.requestCounter++;
    });
  }

  get(id){

    var data = this._createRequestJSON(id, "GET");
    var resp = this.ws.send(data);

    return new PromiseEventEmitter(
      (resolve, reject) =>
       this.outstanding[data.request_id] = {resolve: resolve, reject:reject}
     )
  }

  getAll(){

  }

  insert(){

  }

  // delete(){
  //
  // }

  // update(){
  //
  // }
  //

  on(event, callback){

  }

}

class PromiseEventEmitter extends Promise {

  constructor(callback){
    this.EE = new EventEmitter();
    this.on = EE.on;
    this.once = EE.once;
    this.removeListener = EE.removeListener;
    this.addListener = EE.addListener;
    this.emit = EE.emit;
    super.constructor(callback);
  }

  on(){

  }

}



// var ref = new Fustion("string");
// ref.table("todos-table");
