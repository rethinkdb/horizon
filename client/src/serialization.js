"use strict";
var PRIMITIVES = [
    'string', 'number', 'boolean', 'symbol'];
function isPrimitive(val) {
    return PRIMITIVES.indexOf(typeof val) !== -1;
}
function isPseudoTypeDate(value) {
    return value.$reql_type$ === "TIME";
}
exports.isPseudoTypeDate = isPseudoTypeDate;
function modifyObject(doc) {
    Object.keys(doc).forEach(function (key) {
        doc[key] = deserialize(doc[key]);
    });
    return doc;
}
function deserialize(value) {
    if (value == undefined) {
        return value;
    }
    else if (isPrimitive(value)) {
        return value;
    }
    else if (Array.isArray(value)) {
        return value.map(deserialize);
    }
    else if (isPseudoTypeDate(value)) {
        var date = new Date();
        date.setTime(value.epoch_time * 1000);
        return date;
    }
    else if (value instanceof Object) {
        return modifyObject(value);
    }
}
exports.deserialize = deserialize;
function jsonifyObject(doc) {
    Object.keys(doc).forEach(function (key) {
        doc[key] = serialize(doc[key]);
    });
    return doc;
}
function serialize(value) {
    if (value == undefined) {
        return value;
    }
    else if (isPrimitive(value)) {
        return value;
    }
    else if (Array.isArray(value)) {
        return value.map(serialize);
    }
    else if (value instanceof Date) {
        return {
            $reql_type$: 'TIME',
            epoch_time: value.getTime() / 1000,
            // Rethink will serialize this as "+00:00", but accepts Z
            timezone: 'Z'
        };
    }
    else {
        return jsonifyObject(value);
    }
}
exports.serialize = serialize;
