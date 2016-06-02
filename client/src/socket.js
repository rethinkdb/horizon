"use strict";
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var AsyncSubject_1 = require('rxjs/AsyncSubject');
var BehaviorSubject_1 = require('rxjs/BehaviorSubject');
var Subject_1 = require('rxjs/Subject');
var Observable_1 = require('rxjs/Observable');
require('rxjs/add/observable/merge');
require('rxjs/add/operator/filter');
require('rxjs/add/operator/share');
var serialization_1 = require('./serialization');
var PROTOCOL_VERSION = 'rethinkdb-horizon-v0';
function isErrorResponse(resp) {
    return resp.error !== undefined;
}
function isQueryResponse(resp) {
    return resp.data !== undefined;
}
function isStateResponse(resp) {
    return resp.state !== undefined;
}
function isHandshakeSuccess(resp) {
    return !isErrorResponse(resp) && resp.token !== undefined;
}
// Before connecting the first time
var STATUS_UNCONNECTED = { type: 'unconnected' };
// After the websocket is opened and handshake is completed
var STATUS_READY = { type: 'ready' };
// After unconnected, maybe before or after connected. Any socket level error
var STATUS_ERROR = { type: 'error' };
// Occurs when the socket closes
var STATUS_DISCONNECTED = { type: 'disconnected' };
var ProtocolError = (function (_super) {
    __extends(ProtocolError, _super);
    function ProtocolError(msg, errorCode) {
        _super.call(this, msg);
        this.errorCode = errorCode;
    }
    ProtocolError.prototype.toString = function () {
        return this.message + " (Code: " + this.errorCode + ")";
    };
    return ProtocolError;
}(Error));
exports.ProtocolError = ProtocolError;
// Wraps native websockets with a Subject, which is both an Subscriber
// and an Observable (it is bi-directional after all!). This
// implementation is adapted from Rx.DOM.fromWebSocket and
// RxSocketSubject by Ben Lesh, but it also deals with some simple
// protocol level things like serializing from/to JSON, routing
// request_ids, looking at the `state` field to decide when an
// observable is closed.
var HorizonSocket = (function (_super) {
    __extends(HorizonSocket, _super);
    function HorizonSocket(host, secure, path, handshaker) {
        var _this = this;
        var hostString = "ws" + (secure ? 's' : '') + ":/()/" + host + "/" + path;
        var msgBuffer = [];
        var handshakeSubscription;
        // Handshake is an AsyncSubject because we want it to always cache
        // the last value it received, like a promise
        var handshake = new AsyncSubject_1.AsyncSubject();
        var statusSubject = new BehaviorSubject_1.BehaviorSubject(STATUS_UNCONNECTED);
        // This is the observable part of the Subject. It forwards events
        // from the underlying websocket
        var socketObservable = Observable_1.Observable.create(function (subscriber) {
            var ws = _this.ws = new WebSocket(hostString, PROTOCOL_VERSION);
            ws.onerror = function () {
                // If the websocket experiences the error, we forward it through
                // to the observable. Unfortunately, the event we receive in
                // this callback doesn't tell us much of anything, so there's no
                // reason to forward it on and we just send a generic error.
                statusSubject.next(STATUS_ERROR);
                var errMsg = "Websocket " + hostString + " experienced an error";
                subscriber.error(new Error(errMsg));
            };
            ws.onopen = function () {
                ws.onmessage = function (event) {
                    var deserialized = serialization_1.deserialize(JSON.parse(event.data));
                    subscriber.next(deserialized);
                };
                ws.onclose = function (e) {
                    // This will happen if the socket is closed by the server If
                    // .close is called from the client (see closeSocket), this
                    // listener will be removed
                    statusSubject.next(STATUS_DISCONNECTED);
                    if (e.code !== 1000 || !e.wasClean) {
                        subscriber.error(new Error("Socket closed unexpectedly with code: " + e.code));
                    }
                    else {
                        subscriber.complete();
                    }
                };
                // Send the handshake
                handshakeSubscription = _this.makeRequest(handshaker()).subscribe({
                    next: function (resp) {
                        if (isHandshakeSuccess(resp)) {
                            handshake.next(resp);
                            handshake.complete();
                            statusSubject.next(STATUS_READY);
                        }
                        else {
                            if (isErrorResponse(resp)) {
                                handshake.error(new Error(resp.error));
                            }
                            else {
                                handshake.error(new Error("Invalid handshake response " + resp));
                            }
                            statusSubject.next(STATUS_ERROR);
                        }
                    },
                    error: function (e) { handshake.error(e); },
                    complete: function () { handshake.complete(); }
                });
                // Send any messages that have been buffered
                while (msgBuffer.length > 0) {
                    var msg = msgBuffer.shift();
                    _this.wsSend(msg);
                }
            };
            return function () {
                handshakeSubscription.unsubscribe();
                // This is the "unsubscribe" method on the final Subject
                closeSocket(1000, '');
            };
        }).share(); // This makes it a "hot" observable, and refCounts it
        // Note possible edge cases: the `share` operator is equivalent to
        // .multicast(() => new Subject()).refCount() // RxJS 5
        // .multicast(new Subject()).refCount() // RxJS 4
        // This is the Subscriber part of the Subject. How we can send stuff
        // over the websocket
        var socketSubscriber = {
            next: function (messageToSend) {
                // When next is called on this subscriber
                // Note: If we aren't ready, the message is silently dropped
                if (this.isOpen()) {
                    this.wsSend(messageToSend); // wsSend serializes to a string
                }
                else {
                    msgBuffer.push(messageToSend);
                }
            },
            error: function (error) {
                // The subscriber is receiving an error. Better close the
                // websocket with an error
                if (!error.code) {
                    throw new Error('no code specified. Be sure to pass ' +
                        '{ code: ###, reason: "" } to error()');
                }
                closeSocket(error.code, error.reason);
            },
            complete: function () {
                // complete for the subscriber here is equivalent to "close
                // this socket successfully (which is what code 1000 is)"
                closeSocket(1000, '');
            }
        };
        var closeSocket = function (code, reason) {
            statusSubject.next(STATUS_DISCONNECTED);
            if (_this.ws != null) {
                if (!code) {
                    _this.ws.close(); // successful close
                }
                else {
                    _this.ws.close(code, reason);
                }
                _this.ws.onopen = function () { };
                _this.ws.onclose = function () { };
                _this.ws.onmessage = function () { };
                _this.ws.onerror = function () { };
            }
        };
        _super.call(this, socketSubscriber, socketObservable);
        var requests = new Subject_1.Subject();
        // Unsubscriptions is similar, only it holds only requests to
        // close a particular request_id on the server. Currently we only
        // need these for changefeeds.
        var endRequests = new Subject_1.Subject();
        this.outgoing = Observable_1.Observable.merge(requests, endRequests);
        // How many requests are outstanding
        this.activeRequests = 0;
        // Monotonically increasing counter for request_ids
        this.requestCounter = 0;
        // Now that super has been called, we can add attributes to this
        this.handshake = handshake;
        // Lets external users keep track of the current websocket status
        // without causing it to connect
        this.status = statusSubject;
        this.ws = this.ws || null;
    }
    HorizonSocket.prototype.isOpen = function () {
        return this.ws != null && this.ws.readyState === WebSocket.OPEN;
    };
    // This is used externally to send requests to the server
    HorizonSocket.prototype.makeRequest = function (rawRequest) {
        var _this = this;
        return Observable_1.Observable.create(function (reqSub) {
            // Get a new request id
            var requestId = _this.requestCounter++;
            // Add the request id to the request and the unsubscribe request
            // if there is one
            rawRequest.request_id = requestId;
            var endRequest = { request_id: requestId, type: 'end_subscription' };
            // First, increment activeRequests and decide if we need to
            // connect to the socket
            _this.incrementActive();
            // Now send the request to the server
            _this.requests.next(rawRequest);
            // Create an observable from the socket that filters by request_id
            var unsubscribeFilter = _this
                .filter(function (x) { return x.request_id === requestId; })
                .subscribe({
                next: function (resp) {
                    // Need to faithfully end the stream if there is an error
                    if (isErrorResponse(resp)) {
                        reqSub.error(new ProtocolError(resp.error, resp.error_code));
                    }
                    else if (isQueryResponse(resp) || isHandshakeSuccess(resp)) {
                        try {
                            reqSub.next(resp);
                        }
                        catch (e) {
                        }
                    }
                    if (isStateResponse(resp)) {
                        switch (resp.state) {
                            case 'synced':
                                // Create a little dummy object
                                // for sync notifications
                                reqSub.next({
                                    type: 'state',
                                    state: 'synced'
                                });
                                break;
                            case 'complete':
                                reqSub.complete();
                                break;
                            default: {
                                reqSub.error(new Error("Unrecognized state: " + resp.state));
                            }
                        }
                    }
                },
                error: function (err) { reqSub.error(err); },
                complete: function () { reqSub.complete(); }
            });
            return function () {
                // Unsubscribe if necessary
                _this.endRequests.next(endRequest);
                _this.decrementActive();
                unsubscribeFilter.unsubscribe();
            };
        });
    };
    // Serializes to a string before sending
    HorizonSocket.prototype.wsSend = function (ws, msg) {
        var stringMsg = JSON.stringify(serialization_1.serialize(msg));
        ws.send(stringMsg);
    };
    // Decrement the number of active requests on the socket, and
    // close the socket if we're the last request
    HorizonSocket.prototype.decrementActive = function () {
        if (--this.activeRequests === 0 && this.outgoingSub != undefined) {
            this.outgoingSub.unsubscribe();
        }
    };
    HorizonSocket.prototype.incrementActive = function () {
        if (++this.activeRequests === 1) {
            // We subscribe the socket itself to the subscription and
            // unsubscription requests. Since the socket is both an
            // observable and a subscriber. Here it's acting as an
            // subscriber, watching our requests.
            this.outgoingSub = this.outgoing.subscribe(this);
        }
    };
    return HorizonSocket;
}(Subject_1.Subject));
exports.HorizonSocket = HorizonSocket;
