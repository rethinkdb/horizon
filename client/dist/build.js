require=(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

function EventEmitter() {
  this._events = this._events || {};
  this._maxListeners = this._maxListeners || undefined;
}
module.exports = EventEmitter;

// Backwards-compat with node 0.10.x
EventEmitter.EventEmitter = EventEmitter;

EventEmitter.prototype._events = undefined;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
EventEmitter.defaultMaxListeners = 10;

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function(n) {
  if (!isNumber(n) || n < 0 || isNaN(n))
    throw TypeError('n must be a positive number');
  this._maxListeners = n;
  return this;
};

EventEmitter.prototype.emit = function(type) {
  var er, handler, len, args, i, listeners;

  if (!this._events)
    this._events = {};

  // If there is no 'error' event listener then throw.
  if (type === 'error') {
    if (!this._events.error ||
        (isObject(this._events.error) && !this._events.error.length)) {
      er = arguments[1];
      if (er instanceof Error) {
        throw er; // Unhandled 'error' event
      }
      throw TypeError('Uncaught, unspecified "error" event.');
    }
  }

  handler = this._events[type];

  if (isUndefined(handler))
    return false;

  if (isFunction(handler)) {
    switch (arguments.length) {
      // fast cases
      case 1:
        handler.call(this);
        break;
      case 2:
        handler.call(this, arguments[1]);
        break;
      case 3:
        handler.call(this, arguments[1], arguments[2]);
        break;
      // slower
      default:
        args = Array.prototype.slice.call(arguments, 1);
        handler.apply(this, args);
    }
  } else if (isObject(handler)) {
    args = Array.prototype.slice.call(arguments, 1);
    listeners = handler.slice();
    len = listeners.length;
    for (i = 0; i < len; i++)
      listeners[i].apply(this, args);
  }

  return true;
};

EventEmitter.prototype.addListener = function(type, listener) {
  var m;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events)
    this._events = {};

  // To avoid recursion in the case that type === "newListener"! Before
  // adding it to the listeners, first emit "newListener".
  if (this._events.newListener)
    this.emit('newListener', type,
              isFunction(listener.listener) ?
              listener.listener : listener);

  if (!this._events[type])
    // Optimize the case of one listener. Don't need the extra array object.
    this._events[type] = listener;
  else if (isObject(this._events[type]))
    // If we've already got an array, just append.
    this._events[type].push(listener);
  else
    // Adding the second element, need to change to array.
    this._events[type] = [this._events[type], listener];

  // Check for listener leak
  if (isObject(this._events[type]) && !this._events[type].warned) {
    if (!isUndefined(this._maxListeners)) {
      m = this._maxListeners;
    } else {
      m = EventEmitter.defaultMaxListeners;
    }

    if (m && m > 0 && this._events[type].length > m) {
      this._events[type].warned = true;
      console.error('(node) warning: possible EventEmitter memory ' +
                    'leak detected. %d listeners added. ' +
                    'Use emitter.setMaxListeners() to increase limit.',
                    this._events[type].length);
      if (typeof console.trace === 'function') {
        // not supported in IE 10
        console.trace();
      }
    }
  }

  return this;
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.once = function(type, listener) {
  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  var fired = false;

  function g() {
    this.removeListener(type, g);

    if (!fired) {
      fired = true;
      listener.apply(this, arguments);
    }
  }

  g.listener = listener;
  this.on(type, g);

  return this;
};

// emits a 'removeListener' event iff the listener was removed
EventEmitter.prototype.removeListener = function(type, listener) {
  var list, position, length, i;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events || !this._events[type])
    return this;

  list = this._events[type];
  length = list.length;
  position = -1;

  if (list === listener ||
      (isFunction(list.listener) && list.listener === listener)) {
    delete this._events[type];
    if (this._events.removeListener)
      this.emit('removeListener', type, listener);

  } else if (isObject(list)) {
    for (i = length; i-- > 0;) {
      if (list[i] === listener ||
          (list[i].listener && list[i].listener === listener)) {
        position = i;
        break;
      }
    }

    if (position < 0)
      return this;

    if (list.length === 1) {
      list.length = 0;
      delete this._events[type];
    } else {
      list.splice(position, 1);
    }

    if (this._events.removeListener)
      this.emit('removeListener', type, listener);
  }

  return this;
};

EventEmitter.prototype.removeAllListeners = function(type) {
  var key, listeners;

  if (!this._events)
    return this;

  // not listening for removeListener, no need to emit
  if (!this._events.removeListener) {
    if (arguments.length === 0)
      this._events = {};
    else if (this._events[type])
      delete this._events[type];
    return this;
  }

  // emit removeListener for all listeners on all events
  if (arguments.length === 0) {
    for (key in this._events) {
      if (key === 'removeListener') continue;
      this.removeAllListeners(key);
    }
    this.removeAllListeners('removeListener');
    this._events = {};
    return this;
  }

  listeners = this._events[type];

  if (isFunction(listeners)) {
    this.removeListener(type, listeners);
  } else if (listeners) {
    // LIFO order
    while (listeners.length)
      this.removeListener(type, listeners[listeners.length - 1]);
  }
  delete this._events[type];

  return this;
};

EventEmitter.prototype.listeners = function(type) {
  var ret;
  if (!this._events || !this._events[type])
    ret = [];
  else if (isFunction(this._events[type]))
    ret = [this._events[type]];
  else
    ret = this._events[type].slice();
  return ret;
};

EventEmitter.prototype.listenerCount = function(type) {
  if (this._events) {
    var evlistener = this._events[type];

    if (isFunction(evlistener))
      return 1;
    else if (evlistener)
      return evlistener.length;
  }
  return 0;
};

EventEmitter.listenerCount = function(emitter, type) {
  return emitter.listenerCount(type);
};

function isFunction(arg) {
  return typeof arg === 'function';
}

function isNumber(arg) {
  return typeof arg === 'number';
}

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}

function isUndefined(arg) {
  return arg === void 0;
}

},{}],"Fusion":[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _get = function get(_x, _x2, _x3) { var _again = true; _function: while (_again) { var object = _x, property = _x2, receiver = _x3; _again = false; if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { _x = parent; _x2 = property; _x3 = receiver; _again = true; desc = parent = undefined; continue _function; } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } } };

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { "default": obj }; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var _events = require("events");

var _events2 = _interopRequireDefault(_events);

var Fusion = (function () {
    function Fusion(hostString) {
        _classCallCheck(this, Fusion);

        if (typeof hostString == "object" && hostString.mock == true) {
            this.hostString = "mock";
            this._socket = new MockSocket(hostString, this.classify);
        } else {
            this.hostString = hostString;
            this._socket = new Socket(hostString, this.classify);
        }

        // Hack for fusion(collectionName) syntax
        self = function (collectionName) {
            return self.collection(collectionName);
        };
        Object.setPrototypeOf(self, Object.getPrototypeOf(this));
        return self;
    }

    _createClass(Fusion, [{
        key: "collection",
        value: function collection(name) {
            //Check if collection exists?? Nope, EAFP let server handle it.
            return new Collection(this, name);
        }
    }, {
        key: "classify",
        value: function classify(response) {
            // response -> responseType
            // this might need to go in another class and be given to this class
            if (response.new_val !== null && response.old_val !== null) {
                return 'changed';
            } else if (response.new_val !== null && response.old_val === null) {
                return 'added';
            } else if (response.new_val === null && response.old_val !== null) {
                return 'removed';
            } else if (response.state === 'synced') {
                return 'synced';
            } else {
                return 'unknown';
            }
        }
    }, {
        key: "_query",
        value: function _query(path) {
            return this.socket.send("QUERY", path);
        }
    }, {
        key: "_store",
        value: function _store(path, document, conflict) {
            if (conflict === 'replace') {
                return this.socket.send("STORE_REPLACE", { path: path, data: document });
            } else if (conflict === 'error') {
                return this.socket.send("STORE_ERROR", { path: path, data: document });
            } else {
                return Promise.reject("value of conflict not understood: " + conflict);
            }
        }
    }, {
        key: "_update",
        value: function _update(path, document) {
            return this.socket.send("UPDATE", { path: path, data: document });
        }
    }, {
        key: "_remove",
        value: function _remove(path, id) {
            return this.socket.send("REMOVE", { path: path, data: id });
        }
    }, {
        key: "_subscribe",
        value: function _subscribe(path, updates) {
            if (updates) {
                return this.socket.subscribe(path);
            } else {
                //Emulate subscription with one-shot query
                var emitter = new _events2["default"]();
                this.socket.send("QUERY", path).then(
                // Do we have continues etc like cursors?
                // Right now assuming we get results back as an array
                function (results) {
                    var _iteratorNormalCompletion = true;
                    var _didIteratorError = false;
                    var _iteratorError = undefined;

                    try {
                        for (var _iterator = results[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                            var result = _step.value;

                            emitter.emit("added", { new_val: result, old_val: null });
                        }
                    } catch (err) {
                        _didIteratorError = true;
                        _iteratorError = err;
                    } finally {
                        try {
                            if (!_iteratorNormalCompletion && _iterator["return"]) {
                                _iterator["return"]();
                            }
                        } finally {
                            if (_didIteratorError) {
                                throw _iteratorError;
                            }
                        }
                    }
                });
                return emitter;
            }
        }
    }]);

    return Fusion;
})();

exports.Fusion = Fusion;

var Socket = (function () {
    function Socket(hostString, classifier) {
        _classCallCheck(this, Socket);

        this.ws = new WebSocket("ws://" + hostString);
        this.ws.onmessage = this._onMessage;
        this.ws.onclose = this._onClose;
        this.ws.onopen = this._onOpen;
        this.classifier = classifier;
        this.promises = {};
        this.emitters = {};
        this.requestCounter = 0;
    }

    _createClass(Socket, [{
        key: "send",
        value: function send(type, data) {
            var _this = this;

            var requestId = this.requestCounter++;
            var req = { type: type, data: data, requestId: requestId };
            return new Promise(function (resolve, reject) {
                return _this.promises[requestId] = { resolve: resolve, reject: reject };
            });
        }
    }, {
        key: "subscribe",
        value: function subscribe(path) {
            var requestId = this.requestCounter++;
            var req = { type: "SUBSCRIBE", data: data, requestId: requestId };
            var emitter = new _events2["default"](); // customize?
            this.emitters[requestId] = emitter;
            return emitter;
        }
    }, {
        key: "_onClose",
        value: function _onClose(event) {
            var _iteratorNormalCompletion2 = true;
            var _didIteratorError2 = false;
            var _iteratorError2 = undefined;

            try {
                for (var _iterator2 = this.emitters[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
                    var emitter = _step2.value;

                    emitter.emit('disconnected', event);
                }
                // Do we do something with promises? What if we reconnect
            } catch (err) {
                _didIteratorError2 = true;
                _iteratorError2 = err;
            } finally {
                try {
                    if (!_iteratorNormalCompletion2 && _iterator2["return"]) {
                        _iterator2["return"]();
                    }
                } finally {
                    if (_didIteratorError2) {
                        throw _iteratorError2;
                    }
                }
            }
        }
    }, {
        key: "_onOpen",
        value: function _onOpen(event) {
            var _iteratorNormalCompletion3 = true;
            var _didIteratorError3 = false;
            var _iteratorError3 = undefined;

            try {
                for (var _iterator3 = this.emitters[Symbol.iterator](), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
                    var emitter = _step3.value;

                    emitter.emit('reconnected', event);
                }
            } catch (err) {
                _didIteratorError3 = true;
                _iteratorError3 = err;
            } finally {
                try {
                    if (!_iteratorNormalCompletion3 && _iterator3["return"]) {
                        _iterator3["return"]();
                    }
                } finally {
                    if (_didIteratorError3) {
                        throw _iteratorError3;
                    }
                }
            }
        }
    }, {
        key: "_onMessage",
        value: function _onMessage(event) {
            var resp = JSON.parse(event.data);
            if (this.promises.hasOwnProperty(resp.requestId)) {
                var promise = this.promises[resp.requestId];
                delete this.promises[resp.requestId];

                if (resp.error !== undefined) {
                    promise.reject(resp.error);
                } else {
                    promise.resolve(resp.value);
                }
            } else if (this.emitters.hasOwnProperty(resp.requestId)) {
                var emitter = this.emitters[resp.requestId];
                if (resp.error !== undefined) {
                    emitter.emit("error", resp.error);
                } else {
                    emitter.emit(this.classifier(resp.data), resp.value);
                }
            } else {
                console.error("Unrecognized response: " + event);
            }
        }
    }]);

    return Socket;
})();

var MockSocket = (function (_Socket) {
    _inherits(MockSocket, _Socket);

    function MockSocket(hostString, classifier) {
        _classCallCheck(this, MockSocket);

        _get(Object.getPrototypeOf(MockSocket.prototype), "constructor", this).call(this);
        this.hostString = hostString;
        this.docs = [];
        this.classifier = classifier;
        this.promises = {};
        this.emitters = {};
        this.requestCounter = 0;
    }

    _createClass(MockSocket, [{
        key: "send",
        value: function send(type, data) {
            //Basically, don't actually send anything just store it in an array,
            // inefficient search and no error handling but fine for mocking

            switch (type) {
                case "update":
                    this.docs.forEach(function (doc, index) {
                        if (doc.id == data.id) {
                            this.data[index] = data;
                        }
                    });
                    break;
                case "remove":
                    this.docs.forEach(function (doc, index) {
                        if (doc.id == data.id) {
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
    }, {
        key: "_onOpen",
        value: function _onOpen(event) {
            var _iteratorNormalCompletion4 = true;
            var _didIteratorError4 = false;
            var _iteratorError4 = undefined;

            try {
                for (var _iterator4 = this.emitters[Symbol.iterator](), _step4; !(_iteratorNormalCompletion4 = (_step4 = _iterator4.next()).done); _iteratorNormalCompletion4 = true) {
                    var emitter = _step4.value;

                    emitter.emit('reconnected', event);
                }
            } catch (err) {
                _didIteratorError4 = true;
                _iteratorError4 = err;
            } finally {
                try {
                    if (!_iteratorNormalCompletion4 && _iterator4["return"]) {
                        _iterator4["return"]();
                    }
                } finally {
                    if (_didIteratorError4) {
                        throw _iteratorError4;
                    }
                }
            }
        }
    }]);

    return MockSocket;
})(Socket);

var TermBase = (function () {
    function TermBase(fusion) {
        _classCallCheck(this, TermBase);

        this.fusion = fusion;
    }

    _createClass(TermBase, [{
        key: "subscribe",
        value: function subscribe(updates) {
            // should create a changefeed query, return eventemitter
            return this.fusion._subscribe(this.path);
        }
    }, {
        key: "value",
        value: function value() {
            // return promise with no changefeed
            return this.fusion._value(this.path);
        }
    }]);

    return TermBase;
})();

var Collection = (function () {
    function Collection(fusion, collectionName) {
        _classCallCheck(this, Collection);

        this.collectionName = collectionName;
        this.path = { collection: collectionName };
        this.fusion = fusion;
    }

    _createClass(Collection, [{
        key: "findOne",
        value: function findOne(id) {
            return new FindOne(this.fusion, this.path, id);
        }
    }, {
        key: "find",
        value: function find(fieldName, fieldValue) {
            return new Find(this.fusion, this.path, fieldName, fieldValue);
        }
    }, {
        key: "between",
        value: function between(minVal, maxVal, field) {
            return new Between(this.fusion, this.path, minVal, maxVal, field);
        }
    }, {
        key: "order",
        value: function order(field, descending) {
            return new Order(this.fusion, this.path, field, descending);
        }
    }, {
        key: "store",
        value: function store(document, conflict) {
            return this.fusion._store(this.path, document, conflict);
        }
    }, {
        key: "update",
        value: function update(document) {
            return this.fusion._update(this.path, document);
        }
    }, {
        key: "remove",
        value: function remove(document) {
            return this.fusion._remove(this.path, document);
        }
    }]);

    return Collection;
})();

var Find = (function (_TermBase) {
    _inherits(Find, _TermBase);

    function Find(fusion, path, field, value) {
        _classCallCheck(this, Find);

        _get(Object.getPrototypeOf(Find.prototype), "constructor", this).call(this, fusion);
        this.field;
        this.value = value;
        this.path = Object.assign({ find: { field: field, value: value } }, path);
    }

    _createClass(Find, [{
        key: "order",
        value: function order(field, descending) {
            return new Order(this.fusion, this.path, field, descending);
        }
    }, {
        key: "limit",
        value: function limit(size) {
            return new Limit(this.fusion, this.path, size);
        }
    }]);

    return Find;
})(TermBase);

var FindOne = (function (_TermBase2) {
    _inherits(FindOne, _TermBase2);

    function FindOne(fusion, path, docId) {
        _classCallCheck(this, FindOne);

        _get(Object.getPrototypeOf(FindOne.prototype), "constructor", this).call(this, fusion);
        this.id = docId;
        this.path = Object.assign({ findOne: docId }, path);
    }

    return FindOne;
})(TermBase);

var Between = (function (_TermBase3) {
    _inherits(Between, _TermBase3);

    function Between(fusion, path, minVal, maxVal, field) {
        _classCallCheck(this, Between);

        _get(Object.getPrototypeOf(Between.prototype), "constructor", this).call(this, fusion);
        this.minVal = minVal;
        this.maxVal = maxVal;
        this.field = field;
        this.path = Object.assign({ between: { min: minVal, max: maxVal, field: field } }, path);
    }

    _createClass(Between, [{
        key: "limit",
        value: function limit(size) {
            return new Limit(this.fusion, this.path, size);
        }
    }]);

    return Between;
})(TermBase);

var Order = (function () {
    function Order(fusion, path, field, descending) {
        _classCallCheck(this, Order);

        this.fusion = fusion;
        this.field = field;
        this.direction = direction;
        this.path = Object.assign({ order: { field: field, descending: descending } }, path);
    }

    _createClass(Order, [{
        key: "limit",
        value: function limit(size) {
            return new Limit(this.fusion, this.path, size);
        }
    }, {
        key: "between",
        value: function between(minVal, maxVal) {
            // between is forced to have the same field as this term
            return new Between(this.fusion, this.path, minVal, maxVal, this.field);
        }
    }]);

    return Order;
})();

var Limit = (function (_TermBase4) {
    _inherits(Limit, _TermBase4);

    function Limit(fusion, path, size) {
        _classCallCheck(this, Limit);

        _get(Object.getPrototypeOf(Limit.prototype), "constructor", this).call(this, fusion);
        this.size = size;
        this.path = Object.assign({ limit: size }, path);
    }

    return Limit;
})(TermBase);

},{"events":1}]},{},["Fusion"])


//# sourceMappingURL=build.js.map
