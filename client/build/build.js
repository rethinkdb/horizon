(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
"use strict";

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var Fusion = (function () {
  function Fusion(host_string) {
    _classCallCheck(this, Fusion);

    this.host_string = host_string;
  }

  // connect(host_string){
  //     this.ws = new WebSocket(host_string);
  // }

  _createClass(Fusion, [{
    key: "table",
    value: function table(table_name) {
      //Check if table exists?? Nope, EAFP let server handle it.
      return new Table(this, table_name);
    }
  }]);

  return Fusion;
})();

var Table = (function () {
  function Table(fusion, table_name) {
    _classCallCheck(this, Table);

    this.table_name = table_name;
    this.fusion = fusion;
    this.connection_string = fusion.host_string + "/" + table_name;

    this.ws = new WebSocket(connection_string);
    this.outstanding = [];
    this.requestCounter = 0;
  }

  // var ref = new Fustion("string");
  // ref.table("todos-table");

  _createClass(Table, [{
    key: "_wsOnMessage",
    value: function _wsOnMessage() {}
  }, {
    key: "get",
    value: regeneratorRuntime.mark(function get(id) {
      var data, resp;
      return regeneratorRuntime.wrap(function get$(context$2$0) {
        while (1) switch (context$2$0.prev = context$2$0.next) {
          case 0:
            data = {
              id: id,
              type: "GET",
              request_id: this.requestCounter++
            };
            context$2$0.next = 3;
            return this.ws.send(JSON.stringify(data));

          case 3:
            resp = context$2$0.sent;
            return context$2$0.abrupt("return", new Promise(resp));

          case 5:
          case "end":
            return context$2$0.stop();
        }
      }, get, this);
    })
  }, {
    key: "getAll",
    value: function getAll() {}

    // between(){
    //
    // }
    //
    // orderBy(){
    //
    // }
    //
    // limit(){
    //
    // }

  }, {
    key: "insert",
    value: function insert() {}

    // delete(){
    //
    // }

    // update(){
    //
    // }
    //

  }, {
    key: "on",
    value: function on() {}
  }, {
    key: "catch",
    value: function _catch() {}
  }]);

  return Table;
})();

},{}]},{},[1])


//# sourceMappingURL=build.js.map
