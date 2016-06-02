"use strict";
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var Observable_1 = require('rxjs/Observable');
require('rxjs/add/observable/empty');
require('rxjs/add/operator/publishReplay');
require('rxjs/add/operator/scan');
require('rxjs/add/operator/filter');
require('rxjs/add/operator/map');
require('rxjs/add/operator/toArray');
var check_args_1 = require('./util/check-args');
var valid_index_value_js_1 = require('./util/valid-index-value.js');
var serialization_1 = require('./serialization');
var snakeCase = {
    findAll: 'find_all',
    find: 'find',
    order: 'order',
    above: 'above',
    below: 'below',
    limit: 'limit'
};
function isVersioned(doc) {
    return doc.$hz_v$ !== undefined;
}
// Abstract base class for terms
var TermBase = (function () {
    function TermBase(sendRequest, query, legalMethods) {
        this._sendRequest = sendRequest;
        this._query = query;
        this._legalMethods = legalMethods;
    }
    // Returns a sequence of the result set. Every time it changes the
    // updated sequence will be emitted. If raw change objects are
    // needed, pass the option 'rawChanges: true'. An observable is
    // returned which will lazily emit the query when it is subscribed
    // to
    TermBase.prototype.watch = function (_a) {
        var _b = (_a === void 0 ? {} : _a).rawChanges, rawChanges = _b === void 0 ? false : _b;
        var raw = this._sendRequest('subscribe', this._query);
        if (rawChanges) {
            return raw;
        }
        else {
            return makePresentable(raw, this._query);
        }
    };
    // Grab a snapshot of the current query (non-changefeed). Emits an
    // array with all results. An observable is returned which will
    // lazily emit the query when subscribed to
    TermBase.prototype.fetch = function () {
        var raw = this._sendRequest('query', this._query).map(function (val) {
            delete val.$hz_v$;
            return val;
        });
        if (this._query.find) {
            return raw;
        }
        else {
            return raw.toArray();
        }
    };
    TermBase.prototype.findAll = function () {
        var fieldValues = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            fieldValues[_i - 0] = arguments[_i];
        }
        this._legalToChain('findAll');
        check_args_1["default"]('findAll', arguments, { maxArgs: 100 });
        return new FindAll(this._sendRequest, this._query, fieldValues);
    };
    TermBase.prototype.find = function (idOrObject) {
        this._legalToChain('find');
        check_args_1["default"]('find', arguments);
        return new Find(this._sendRequest, this._query, idOrObject);
    };
    TermBase.prototype.order = function (fields, direction) {
        if (direction === void 0) { direction = 'ascending'; }
        this._legalToChain('order');
        check_args_1["default"]('order', arguments, { minArgs: 1, maxArgs: 2 });
        return new Order(this._sendRequest, this._query, fields, direction);
    };
    TermBase.prototype.above = function (aboveSpec, bound) {
        if (bound === void 0) { bound = 'closed'; }
        this._legalToChain('above');
        check_args_1["default"]('above', arguments, { minArgs: 1, maxArgs: 2 });
        return new Above(this._sendRequest, this._query, aboveSpec, bound);
    };
    TermBase.prototype.below = function (belowSpec, bound) {
        if (bound === void 0) { bound = 'open'; }
        this._legalToChain('below');
        check_args_1["default"]('below', arguments, { minArgs: 1, maxArgs: 2 });
        return new Below(this._sendRequest, this._query, belowSpec, bound);
    };
    TermBase.prototype.limit = function (size) {
        this._legalToChain('limit');
        check_args_1["default"]('limit', arguments);
        return new Limit(this._sendRequest, this._query, size);
    };
    /* Validation check to throw an exception if a method is chained onto
       a query that already has it.  */
    TermBase.prototype._legalToChain = function (key) {
        if (this._legalMethods.indexOf(key) === -1) {
            throw new Error(key + " cannot be called on the current query");
        }
        if (snakeCase[key] in this._query) {
            throw new Error(key + " has already been called on this query");
        }
    };
    return TermBase;
}());
exports.TermBase = TermBase;
// Turn a raw observable of server responses into user-presentable events
//
// `observable` is the base observable with full responses coming from
//              the HorizonSocket
// `query` is the value of `options` in the request
function makePresentable(observable, query) {
    // Whether the entire data structure is in each change
    var pointQuery = Boolean(query.find);
    if (pointQuery) {
        var hasEmitted_1 = false;
        var seedVal = null;
        // Simplest case: just pass through new_val
        return observable
            .filter(function (change) { return !hasEmitted_1 || change.type !== 'state'; })
            .scan(function (previous, change) {
            hasEmitted_1 = true;
            if (change.new_val != null) {
                delete change.new_val.$hz_v$;
            }
            if (change.old_val != null) {
                delete change.old_val.$hz_v$;
            }
            if (change.state === 'synced') {
                return previous;
            }
            else {
                return change.new_val;
            }
        }, seedVal);
    }
    else {
        var seedVal = { emitted: false, val: [] };
        return observable
            .scan(function (state, change) {
            if (change.new_val != null) {
                delete change.new_val.$hz_v$;
            }
            if (change.old_val != null) {
                delete change.old_val.$hz_v$;
            }
            if (change.state === 'synced') {
                state.emitted = true;
            }
            state.val = applyChange(state.val.slice(), change);
            return state;
        }, seedVal)
            .filter(function (state) { return state.emitted; })
            .map(function (x) { return x.val; });
    }
}
function applyChange(arr, change) {
    switch (change.type) {
        case 'remove':
        case 'uninitial': {
            // Remove old values from the array
            if (change.old_offset != null) {
                arr.splice(change.old_offset, 1);
            }
            else {
                var index = arr.findIndex(function (x) { return x.id === change.old_val.id; });
                arr.splice(index, 1);
            }
            break;
        }
        case 'add':
        case 'initial': {
            // Add new values to the array
            if (change.new_offset != null) {
                // If we have an offset, put it in the correct location
                arr.splice(change.new_offset, 0, change.new_val);
            }
            else {
                // otherwise for unordered results, push it on the end
                arr.push(change.new_val);
            }
            break;
        }
        case 'change': {
            // Modify in place if a change is happening
            if (change.old_offset != null) {
                // Remove the old document from the results
                arr.splice(change.old_offset, 1);
            }
            if (change.new_offset != null) {
                // Splice in the new val if we have an offset
                arr.splice(change.new_offset, 0, change.new_val);
            }
            else {
                // If we don't have an offset, find the old val and
                // replace it with the new val
                var index = arr.findIndex(function (x) { return x.id === change.old_val.id; });
                arr[index] = change.new_val;
            }
            break;
        }
        case 'state': {
            // This gets hit if we have not emitted yet, and should
            // result in an empty array being output.
            break;
        }
        default:
            throw new Error("unrecognized 'type' field from server " + JSON.stringify(change));
    }
    return arr;
}
exports.applyChange = applyChange;
/** @this Collection
 Implements writeOps for the Collection class
*/
function writeOp(name, args, documents) {
    check_args_1["default"](name, args);
    var isBatch = true;
    var wrappedDocs = documents;
    if (!Array.isArray(documents)) {
        // Wrap in an array if we need to
        wrappedDocs = [documents];
        isBatch = false;
    }
    else if (documents.length === 0) {
        // Don't bother sending no-ops to the server
        return Observable_1.Observable.empty();
    }
    var options = Object.assign({}, this._query, { data: serialization_1.serialize(wrappedDocs) });
    var observable = this._sendRequest(name, options);
    if (isBatch) {
        // If this is a batch writeOp, each document may succeed or fail
        // individually.
        observable = observable.map(function (resp) { return resp.error ? new Error(resp.error) : resp; });
    }
    else {
        // If this is a single writeOp, the entire operation should fail
        // if any fails.
        var _prevOb_1 = observable;
        observable = Observable_1.Observable.create(function (subscriber) {
            _prevOb_1.subscribe({
                next: function (resp) {
                    if (resp.error) {
                        // TODO: handle error ids when we get them
                        subscriber.error(new Error(resp.error));
                    }
                    else {
                        subscriber.next(resp);
                    }
                },
                error: function (err) { subscriber.error(err); },
                complete: function () { subscriber.complete(); }
            });
        });
    }
    if (!this._lazyWrites) {
        // Need to buffer response since this becomes a hot observable and
        // when we subscribe matters
        observable = observable.publishReplay().refCount();
        observable.subscribe();
    }
    return observable;
}
var Collection = (function (_super) {
    __extends(Collection, _super);
    function Collection(sendRequest, collectionName, lazyWrites) {
        var query = { collection: collectionName };
        var legalMethods = [
            'find', 'findAll', 'justInitial', 'order', 'above', 'below', 'limit'];
        _super.call(this, sendRequest, query, legalMethods);
        this._lazyWrites = lazyWrites;
    }
    Collection.prototype.store = function (documents) {
        return this.writeOp('store', arguments, documents);
    };
    Collection.prototype.upsert = function (documents) {
        return this.writeOp('upsert', arguments, documents);
    };
    Collection.prototype.insert = function (documents) {
        return this.writeOp('insert', arguments, documents);
    };
    Collection.prototype.replace = function (documents) {
        return this.writeOp('replace', arguments, documents);
    };
    Collection.prototype.update = function (documents) {
        return this.writeOp('update', arguments, documents);
    };
    Collection.prototype.remove = function (documentOrId) {
        var wrapped = valid_index_value_js_1["default"](documentOrId) ?
            { id: documentOrId } : documentOrId;
        return this.writeOp('remove', arguments, wrapped);
    };
    Collection.prototype.removeAll = function (documentsOrIds) {
        if (!Array.isArray(documentsOrIds)) {
            throw new Error('removeAll takes an array as an argument');
        }
        var wrapped = documentsOrIds.map(function (item) {
            if (valid_index_value_js_1["default"](item)) {
                return { id: item };
            }
            else {
                return item;
            }
        });
        return this.writeOp('removeAll', arguments, wrapped);
    };
    return Collection;
}(TermBase));
exports.Collection = Collection;
var Find = (function (_super) {
    __extends(Find, _super);
    function Find(sendRequest, previousQuery, idOrObject) {
        var findObject = valid_index_value_js_1["default"](idOrObject) ?
            { id: idOrObject } : idOrObject;
        var query = Object.assign({}, previousQuery, { find: findObject });
        _super.call(this, sendRequest, query, []);
    }
    return Find;
}(TermBase));
exports.Find = Find;
var FindAll = (function (_super) {
    __extends(FindAll, _super);
    function FindAll(sendRequest, previousQuery, fieldValues) {
        var wrappedFields = fieldValues
            .map(function (item) { return valid_index_value_js_1["default"](item) ? { id: item } : item; });
        var options = { find_all: wrappedFields };
        var findAllQuery = Object.assign({}, previousQuery, options);
        var legalMethods;
        if (wrappedFields.length === 1) {
            legalMethods = ['order', 'above', 'below', 'limit'];
        }
        else {
            // The vararg version of findAll cannot have anything chained to it
            legalMethods = [];
        }
        _super.call(this, sendRequest, findAllQuery, legalMethods);
    }
    return FindAll;
}(TermBase));
exports.FindAll = FindAll;
var Above = (function (_super) {
    __extends(Above, _super);
    function Above(sendRequest, previousQuery, aboveSpec, bound) {
        var option = { above: [aboveSpec, bound] };
        var query = Object.assign({}, previousQuery, option);
        var legalMethods = ['findAll', 'order', 'below', 'limit'];
        _super.call(this, sendRequest, query, legalMethods);
    }
    return Above;
}(TermBase));
exports.Above = Above;
var Below = (function (_super) {
    __extends(Below, _super);
    function Below(sendRequest, previousQuery, belowSpec, bound) {
        var options = { below: [belowSpec, bound] };
        var query = Object.assign({}, previousQuery, options);
        var legalMethods = ['findAll', 'order', 'above', 'limit'];
        _super.call(this, sendRequest, query, legalMethods);
    }
    return Below;
}(TermBase));
exports.Below = Below;
var Order = (function (_super) {
    __extends(Order, _super);
    function Order(sendRequest, previousQuery, fields, direction) {
        var wrappedFields = Array.isArray(fields) ? fields : [fields];
        var options = { order: [wrappedFields, direction] };
        var query = Object.assign({}, previousQuery, options);
        var legalMethods = ['findAll', 'above', 'below', 'limit'];
        _super.call(this, sendRequest, query, legalMethods);
    }
    return Order;
}(TermBase));
exports.Order = Order;
var Limit = (function (_super) {
    __extends(Limit, _super);
    function Limit(sendRequest, previousQuery, size) {
        var query = Object.assign({}, previousQuery, { limit: size });
        // Nothing is legal to chain after .limit
        _super.call(this, sendRequest, query, []);
    }
    return Limit;
}(TermBase));
exports.Limit = Limit;
