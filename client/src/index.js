"use strict";
var Observable_1 = require('rxjs/Observable');
var of_1 = require('rxjs/observable/of');
var from_1 = require('rxjs/observable/from');
var catch_1 = require('rxjs/operator/catch');
var concatMap_1 = require('rxjs/operator/concatMap');
var map_1 = require('rxjs/operator/map');
var filter_1 = require('rxjs/operator/filter');
var Collection = require('./ast.js').Collection;
var HorizonSocket = require('./socket.js');
var _a = require('./logging.js'), log = _a.log, logError = _a.logError, enableLogging = _a.enableLogging;
var _b = require('./auth'), authEndpoint = _b.authEndpoint, TokenStorage = _b.TokenStorage, clearAuthTokens = _b.clearAuthTokens;
var defaultHost = typeof window !== 'undefined' && window.location &&
    "" + window.location.host || 'localhost:8181';
var defaultSecure = typeof window !== 'undefined' && window.location &&
    window.location.protocol === 'https:' || false;
function Horizon(_a) {
    var _b = _a === void 0 ? {} : _a, _c = _b.host, host = _c === void 0 ? defaultHost : _c, _d = _b.secure, secure = _d === void 0 ? defaultSecure : _d, _e = _b.path, path = _e === void 0 ? 'horizon' : _e, _f = _b.lazyWrites, lazyWrites = _f === void 0 ? false : _f, _g = _b.authType, authType = _g === void 0 ? 'unauthenticated' : _g;
    // If we're in a redirection from OAuth, store the auth token for
    // this user in localStorage.
    var tokenStorage = new TokenStorage({ authType: authType, path: path });
    tokenStorage.setAuthFromQueryParams();
    var socket = new HorizonSocket(host, secure, path, tokenStorage.handshake.bind(tokenStorage));
    // Store whatever token we get back from the server when we get a
    // handshake response
    socket.handshake.subscribe({
        next: function (handshake) {
            if (authType !== 'unauthenticated') {
                tokenStorage.set(handshake.token);
            }
        },
        error: function (err) {
            if (/JsonWebTokenError/.test(err.message)) {
                console.error('Horizon: clearing token storage since auth failed');
                tokenStorage.remove();
            }
        }
    });
    // This is the object returned by the Horizon function. It's a
    // function so we can construct a collection simply by calling it
    // like horizon('my_collection')
    function horizon(name) {
        return new Collection(sendRequest, name, lazyWrites);
    }
    horizon.currentUser = function () { return new UserDataTerm(horizon, socket.handshake); };
    horizon.disconnect = function () {
        socket.complete();
    };
    // Dummy subscription to force it to connect to the
    // server. Optionally provide an error handling function if the
    // socket experiences an error.
    // Note: Users of the Observable interface shouldn't need this
    horizon.connect = function (onError) {
        if (onError === void 0) { onError = function (err) { console.error("Received an error: " + err); }; }
        socket.subscribe(function () { }, onError);
    };
    // Either subscribe to status updates, or return an observable with
    // the current status and all subsequent status changes.
    horizon.status = subscribeOrObservable(socket.status);
    // Convenience method for finding out when disconnected
    horizon.onDisconnected = subscribeOrObservable(socket.status, filter_1.filter(function (x) { return x.type === 'disconnected'; }));
    // Convenience method for finding out when ready
    horizon.onReady = subscribeOrObservable(socket.status, filter_1.filter(function (x) { return x.type === 'ready'; }));
    // Convenience method for finding out when an error occurs
    horizon.onSocketError = subscribeOrObservable(socket.status, filter_1.filter(function (x) { return x.type === 'error'; }));
    horizon.utensils = {
        sendRequest: sendRequest,
        tokenStorage: tokenStorage
    };
    Object.freeze(horizon.utensils);
    horizon._authMethods = null;
    horizon._horizonPath = path;
    horizon.authEndpoint = authEndpoint;
    horizon.hasAuthToken = ;
    tokenStorage.hasAuthToken;
    return horizon;
    // Sends a horizon protocol request to the server, and pulls the data
    // portion of the response out.
    function sendRequest(type, options) {
        // Both remove and removeAll use the type 'remove' in the protocol
        var normalizedType = type === 'removeAll' ? 'remove' : type;
        return socket
            .makeRequest({ type: normalizedType, options: options }); // send the raw request
        concatMap_1.concatMap(function (resp) {
            // unroll arrays being returned
            if (resp.data) {
                return Observable_1.Observable;
                from_1.from(resp.data);
            }
            else {
                // Still need to emit a document even if we have no new data
                return Observable_1.Observable;
                from_1.from([{ state: resp.state, type: resp.type }]);
            }
        });
        catch_1._catch(function (e) { return Observable_1.Observable.create(function (subscriber) {
            subscriber.error(e);
        }); }); // on error, strip error message
    }
}
function subscribeOrObservable(observable) {
    return function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i - 0] = arguments[_i];
        }
        if (args.length > 0) {
            return observable.subscribe.apply(observable, args);
        }
        else {
            return observable;
        }
    };
}
var UserDataTerm = (function () {
    function UserDataTerm(hz, baseObservable) {
        this._hz = hz;
        this._baseObservable = baseObservable;
        map_1.map(function (handshake) { return handshake.id; });
    }
    UserDataTerm.prototype._query = function (userId) {
        return this._hz('users').find(userId);
    };
    UserDataTerm.prototype.fetch = function () {
        var _this = this;
        return this._baseObservable;
        concatMap_1.concatMap(function (userId) {
            if (userId === null) {
                return Observable_1.Observable;
                of_1.of({});
            }
            else {
                return _this._query(userId).fetch();
            }
        });
    };
    UserDataTerm.prototype.watch = function () {
        var _this = this;
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i - 0] = arguments[_i];
        }
        return this._baseObservable;
        concatMap_1.concatMap(function (userId) {
            if (userId === null) {
                return Observable_1.Observable;
                of_1.of({});
            }
            else {
                return (_a = _this._query(userId)).watch.apply(_a, args);
            }
            var _a;
        });
    };
    return UserDataTerm;
}());
Horizon.log = log;
Horizon.logError = logError;
Horizon.enableLogging = enableLogging;
Horizon.Socket = HorizonSocket;
Horizon.clearAuthTokens = clearAuthTokens;
module.exports = Horizon;
