'use strict';

const check = (pred, message) => {
  if (!pred) {
    throw new Error(message);
  }
};

const fail = (message) => check(false, message);

class IndexMissing extends Error {
  constructor(collection, fields) {
    super(`Collection "${collection.name}" has no index matching ${JSON.stringify(fields)}.`);
    this.collection = collection;
    this.fields = fields;
  }
}

class CollectionMissing extends Error {
  constructor(name) {
    super(`Collection "${name}" does not exist.`);
    this.name = name;
  }
}

class IndexNotReady extends Error {
  constructor(collection, index) {
    super(`Index on collection "${collection.name}" is not ready: ${JSON.stringify(index.fields)}.`);
    this.collection = collection;
    this.index = index;
  }
}

class CollectionNotReady extends Error {
  constructor(collection) {
    super(`Collection "${collection.name}" is not ready.`);
    this.collection = collection;
  }
}

module.exports = {
  check,
  fail,
  IndexMissing,
  IndexNotReady,
  CollectionMissing,
  CollectionNotReady,
};
