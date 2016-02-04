'use strict'

const snakeCase = require('snake-case')

const Rx = require('rx')
const { checkArgs,
        validIndexValue,
        assign,
        argParse } = require('./utility.js')
const { serialize } = require('./serialization.js')


/**
 @this TermBase

 Validation check to throw an exception if a method is chained onto a
 query that already has it. It belongs to TermBase, but we don't want
 to pollute the objects with it (since it isn't useful to api users),
 so it's dynamically bound with .call inside methods that use it. Once
 ES7 is relatively stable, it'd be nice to use the (::) syntax for
 this kind of call
*/
function checkIfLegalToChain(key) {
  if (this._legalMethods.indexOf(key) === -1) {
    throw new Error(`${key} cannot be called on the current query`)
  }
  if (snakeCase(key) in this._query) {
    throw new Error(`${key} has already been called on this query`)
  }
}

// Abstract base class for terms
class TermBase {
  constructor(sendRequest, query, legalMethods) {
    this._sendRequest = sendRequest
    this._query = query
    this._legalMethods = legalMethods
  }
  // Returns a sequence of the result set. Every time it changes the
  // updated sequence will be emitted. If raw change objects are
  // needed, pass the option 'rawChanges: true'. If a callback is
  // passed, the query is run immediately. If no callback is passed,
  // an observable is returned (which will lazily emit the query when
  // it is subscribed to)
  watch(...args) {
    const [ options, cb ] = argParse('watch', args, [
      { type: 'options', default: { rawChanges: false } },
      { type: 'callback', default: null },
    ])
    const raw = this._sendRequest('subscribe', this._query)
    const observable = options.rawChanges ?
            raw : makePresentable(raw, this._query)
    if (!cb) {
      return observable
    } else {
      // Translate node-style callback to Observer
      return observable.subscribe(
        val => cb(null, val),
        err => cb(err)
      )
    }
  }
  // Grab a snapshot of the current query (non-changefeed). Emits an
  // array with all results. If you'd rather receive emit on every
  // document, pass the option 'asCursor: true'. If a callback is
  // passed, the query is run immediately. If no callback is passed,
  // an observable is returned (which will lazily emit the query when
  // subscribed to)
  fetch(...args) {
    const [ options, cb ] = argParse('fetch', args, [
      { type: 'options', default: { asCursor: true } },
      { type: 'callback', default: null },
    ])
    const raw = this._sendRequest('query', this._query)
    const observable = options.asCursor ? raw : raw.toArray()
    return !cb ? observable : observable.subscribe(...args)
  }
  findAll(...fieldValues) {
    checkIfLegalToChain.call(this, 'findAll')
    checkArgs('findAll', arguments, { maxArgs: 100 })
    return new FindAll(this._sendRequest, this._query, fieldValues)
  }
  find(idOrObject) {
    checkIfLegalToChain.call(this, 'find')
    checkArgs('find', arguments)
    return new Find(this._sendRequest, this._query, idOrObject)
  }
  order(fields, direction = 'ascending') {
    checkIfLegalToChain.call(this, 'order')
    checkArgs('order', arguments, { minArgs: 1, maxArgs: 2 })
    return new Order(this._sendRequest, this._query, fields, direction)
  }
  above(aboveSpec, bound = 'closed') {
    checkIfLegalToChain.call(this, 'above')
    checkArgs('above', arguments, { minArgs: 1, maxArgs: 2 })
    return new Above(this._sendRequest, this._query, aboveSpec, bound)
  }
  below(belowSpec, bound = 'open') {
    checkIfLegalToChain.call(this, 'below')
    checkArgs('below', arguments, { minArgs: 1, maxArgs: 2 })
    return new Below(this._sendRequest, this._query, belowSpec, bound)
  }
  limit(size) {
    checkIfLegalToChain.call(this, 'limit')
    checkArgs('limit', arguments)
    return new Limit(this._sendRequest, this._query, size)
  }
}

// Turn a raw observable of server responses into user-presentable events
//
// `observable` is the base observable with full responses coming from
//              the FusionSocket
// `query` is the value of `options` in the request
function makePresentable(observable, query) {
  // Whether the entire data structure is in each change
  const pointQuery = Boolean(query.find)
  // Whether the result set must be sorted before emitting it
  const orderedQuery = Boolean(query.order)

  if (pointQuery) {
    // Simplest case: just pass through new_val
    return observable.map(change => change.new_val)
  } else {
    // Need to incrementally add to and remove from an array
    return observable.scan([], (previous, change) => {
      const arr = previous.slice()
      // Remove old values from the array
      if (change.old_val) {
        const index = arr.findIndex(x => x.id === change.old_val.id)
        if (index !== -1) {
          arr.splice(index, 1)
        }
      }
      // Add new values to the array
      if (change.new_val) {
        arr.push(change.new_val)
      }
      // Sort the array if the query is ordered
      if (orderedQuery) {
        sortByFields(arr, query.order[0], query.order[1] === 'ascending')
      }
      return arr
    })
  }
}

// Sorts documents in an array by the fields specified.
// Note: arr must be an array of objects Also, this does not sort the
// same way RethinkDB does, it's a stop-gap until orderBy.limit
// changefeeds support giving the position for new_val and old_val in
// the results
function sortByFields(arr, fields, ascending) {
  const result = ascending ? -1 : 1
  return arr.sort((a, b) => {
    const af = fields.map(field => a[field])
    const bf = fields.map(field => b[field])
    if (af < bf) {
      return result
    } else if (af > bf) {
      return -result
    } else {
      return 0
    }
  })
}

/** @this Collection
 Implements writeOps for the Collection class
*/
function writeOp(name, args, documents, cb) {
  checkArgs(name, args)
  let wrappedDocs = documents
  if (!Array.isArray(documents)) {
    // Wrap in an array if we need to
    wrappedDocs = [ documents ]
  } else if (documents.length === 0) {
    // Don't bother sending no-ops to the server
    return Rx.Observable.empty()
  }
  const options = assign(this._query, { data: serialize(wrappedDocs) })
  const observable = this._sendRequest(name, options)
  if (cb) {
    // If we have a callback, we send the write query
    // immediately. They aren't using the observable interface.
    observable.subscribe(
      val => cb(null, val),
      err => cb(err)
    )
  }
  return observable
}

class Collection extends TermBase {
  constructor(sendRequest, collectionName) {
    const query = { collection: collectionName }
    const legalMethods = [
      'find', 'findAll', 'justInitial', 'order', 'above', 'below', 'limit' ]
    super(sendRequest, query, legalMethods)
  }
  store(documents, cb) {
    return writeOp.call(this, 'store', arguments, documents, cb)
  }
  upsert(documents, cb) {
    return writeOp.call(this, 'upsert', arguments, documents, cb)
  }
  insert(documents, cb) {
    return writeOp.call(this, 'insert', arguments, documents, cb)
  }
  replace(documents, cb) {
    return writeOp.call(this, 'replace', arguments, documents, cb)
  }
  update(documents, cb) {
    return writeOp.call(this, 'update', arguments, documents, cb)
  }
  remove(documentOrId, cb) {
    const wrapped = validIndexValue(documentOrId) ?
          { id: documentOrId } : documentOrId
    return writeOp.call(this, 'remove', arguments, wrapped, cb)
  }
  removeAll(documentsOrIds, cb) {
    if (!Array.isArray(documentsOrIds)) {
      throw new Error('removeAll takes an array as an argument')
    }
    const wrapped = documentsOrIds.map(item => {
      if (validIndexValue(item)) {
        return { id: item }
      } else {
        return item
      }
    })
    return writeOp.call(this, 'remove', arguments, wrapped, cb)
  }
}

class Find extends TermBase {
  constructor(sendRequest, previousQuery, idOrObject) {
    const findObject = validIndexValue(idOrObject) ?
          { id: idOrObject } : idOrObject
    const query = assign(previousQuery, { find: findObject })
    super(sendRequest, query, [])
    // We override the _sendRequest function to unwrap the array
    // returned by the protocol. Find returns only a single result
    this._sendRequest = (type_, query_) => sendRequest(type_, query_)
  }
}

class FindAll extends TermBase {
  constructor(sendRequest, previousQuery, fieldValues) {
    const wrappedFields = fieldValues
          .map(item => validIndexValue(item) ? { id: item } : item)
    const options = { find_all: wrappedFields }
    const findAllQuery = assign(previousQuery, options)
    let legalMethods
    if (wrappedFields.length === 1) {
      legalMethods = [ 'order', 'above', 'below', 'limit' ]
    } else {
      // The vararg version of findAll cannot have anything chained to it
      legalMethods = []
    }
    super(sendRequest, findAllQuery, legalMethods)
  }
}

class Above extends TermBase {
  constructor(sendRequest, previousQuery, aboveSpec, bound) {
    const option = { above: [ aboveSpec, bound ] }
    const query = assign(previousQuery, option)
    const legalMethods = [ 'findAll', 'order', 'below', 'limit' ]
    super(sendRequest, query, legalMethods)
  }
}

class Below extends TermBase {
  constructor(sendRequest, previousQuery, belowSpec, bound) {
    const options = { below: [ belowSpec, bound ] }
    const query = assign(previousQuery, options)
    const legalMethods = [ 'findAll', 'order', 'above', 'limit' ]
    super(sendRequest, query, legalMethods)
  }
}

class Order extends TermBase {
  constructor(sendRequest, previousQuery, fields, direction) {
    const wrappedFields = Array.isArray(fields) ? fields : [ fields ]
    const options = { order: [ wrappedFields, direction ] }
    const query = assign(previousQuery, options)
    const legalMethods = [ 'findAll', 'above', 'below', 'limit' ]
    super(sendRequest, query, legalMethods)
  }
}

class Limit extends TermBase {
  constructor(sendRequest, previousQuery, size) {
    const query = assign(previousQuery, { limit: size })
    // Nothing is legal to chain after .limit
    super(sendRequest, query, [])
  }
}

module.exports = {
  TermBase,
  Collection,
  FindAll,
  Find,
  Above,
  Below,
  Order,
  Limit,
}
