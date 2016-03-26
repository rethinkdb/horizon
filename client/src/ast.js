const snakeCase = require('snake-case')

const Rx = require('rx')
const checkArgs = require('./util/check-args')
const validIndexValue = require('./util/valid-index-value.js')
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
  // needed, pass the option 'rawChanges: true'. An observable is
  // returned which will lazily emit the query when it is subscribed
  // to
  watch({ rawChanges = false } = {}) {
    const raw = this._sendRequest('subscribe', this._query)
    if (rawChanges) {
      return raw
    } else {
      return makePresentable(raw, this._query)
    }
  }
  // Grab a snapshot of the current query (non-changefeed). Emits an
  // array with all results. An observable is returned which will
  // lazily emit the query when subscribed to
  fetch() {
    return this._sendRequest('query', this._query)
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
//              the HorizonSocket
// `query` is the value of `options` in the request
function makePresentable(observable, query) {
  // Whether the entire data structure is in each change
  const pointQuery = Boolean(query.find)
  // Whether the result set must be sorted before emitting it
  const orderedQuery = Boolean(query.order)

  if (pointQuery) {
    const seedVal = null
    // Simplest case: just pass through new_val
    return observable.scan((previous, change) => {
      if (change.state === 'synced') {
        return previous
      } else {
        return change.new_val
      }
    }, seedVal)
  } else {
    const seedVal = []
    // Need to incrementally add to and remove from an array
    return observable.scan((previous, change) => {
      const arr = previous.slice()
      switch (change.type) {
      case 'remove':
      case 'uninitial': {
        // Remove old values from the array
        const index = arr.findIndex(x => x.id === change.old_val.id)
        if (index !== -1) {
          arr.splice(index, 1)
        }
        break
      }
      case 'add':
      case 'initial': {
        // Add new values to the array
        arr.push(change.new_val)
        break
      }
      case 'change': {
        // Modify in place if a change is happening
        const index = arr.findIndex(x => x.id === change.old_val.id)
        arr[index] = change.new_val
        break
      }
      case 'state': {
        // just emit the accumulator unchanged
        break
      }
      default:
        throw new Error(
          `unrecognized 'type' field from server ${JSON.stringify(change)}`)
      }
      // Sort the array if the query is ordered
      if (orderedQuery) {
        sortByFields(arr, query.order[0], query.order[1] === 'ascending')
      }
      return arr
    }, seedVal)
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
function writeOp(name, args, documents) {
  checkArgs(name, args)
  let wrappedDocs = documents
  if (!Array.isArray(documents)) {
    // Wrap in an array if we need to
    wrappedDocs = [ documents ]
  } else if (documents.length === 0) {
    // Don't bother sending no-ops to the server
    return Rx.Observable.empty()
  }
  const options = Object.assign({}, this._query, { data: serialize(wrappedDocs) })
  let observable = this._sendRequest(name, options)
  if (!this._lazyWrites) {
    // Need to buffer response since this becomes a hot observable and
    // when we subscribe matters
    observable = observable.shareReplay()
    observable.subscribe()
  }
  return observable
}

class Collection extends TermBase {
  constructor(sendRequest, collectionName, lazyWrites) {
    const query = { collection: collectionName }
    const legalMethods = [
      'find', 'findAll', 'justInitial', 'order', 'above', 'below', 'limit' ]
    super(sendRequest, query, legalMethods)
    this._lazyWrites = lazyWrites
  }
  store(documents) {
    return writeOp.call(this, 'store', arguments, documents)
  }
  upsert(documents) {
    return writeOp.call(this, 'upsert', arguments, documents)
  }
  insert(documents) {
    return writeOp.call(this, 'insert', arguments, documents)
  }
  replace(documents) {
    return writeOp.call(this, 'replace', arguments, documents)
  }
  update(documents) {
    return writeOp.call(this, 'update', arguments, documents)
  }
  remove(documentOrId) {
    const wrapped = validIndexValue(documentOrId) ?
          { id: documentOrId } : documentOrId
    return writeOp.call(this, 'remove', arguments, wrapped)
  }
  removeAll(documentsOrIds) {
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
    return writeOp.call(this, 'removeAll', arguments, wrapped)
  }
}

class Find extends TermBase {
  constructor(sendRequest, previousQuery, idOrObject) {
    const findObject = validIndexValue(idOrObject) ?
          { id: idOrObject } : idOrObject
    const query = Object.assign({}, previousQuery, { find: findObject })
    super(sendRequest, query, [])
  }
}

class FindAll extends TermBase {
  constructor(sendRequest, previousQuery, fieldValues) {
    const wrappedFields = fieldValues
          .map(item => validIndexValue(item) ? { id: item } : item)
    const options = { find_all: wrappedFields }
    const findAllQuery = Object.assign({}, previousQuery, options)
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
    const query = Object.assign({}, previousQuery, option)
    const legalMethods = [ 'findAll', 'order', 'below', 'limit' ]
    super(sendRequest, query, legalMethods)
  }
}

class Below extends TermBase {
  constructor(sendRequest, previousQuery, belowSpec, bound) {
    const options = { below: [ belowSpec, bound ] }
    const query = Object.assign({}, previousQuery, options)
    const legalMethods = [ 'findAll', 'order', 'above', 'limit' ]
    super(sendRequest, query, legalMethods)
  }
}

class Order extends TermBase {
  constructor(sendRequest, previousQuery, fields, direction) {
    const wrappedFields = Array.isArray(fields) ? fields : [ fields ]
    const options = { order: [ wrappedFields, direction ] }
    const query = Object.assign({}, previousQuery, options)
    const legalMethods = [ 'findAll', 'above', 'below', 'limit' ]
    super(sendRequest, query, legalMethods)
  }
}

class Limit extends TermBase {
  constructor(sendRequest, previousQuery, size) {
    const query = Object.assign({}, previousQuery, { limit: size })
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
