import { Observable } from 'rxjs/Observable'
import { empty } from 'rxjs/observable/empty'
import { publishReplay } from 'rxjs/operator/publishReplay'
import { scan } from 'rxjs/operator/scan'
import { filter } from 'rxjs/operator/filter'

import snakeCase from 'snake-case'

import checkArgs from './util/check-args'
import validIndexValue from './util/valid-index-value.js'
import { serialize } from './serialization.js'


/**
 @this TermBase

 Validation check to throw an exception if a method is chained onto a
 query that already has it. It belongs to TermBase, but we don't want
 to pollute the objects with it (since it isn't useful to api users),
 so it's dynamically bound with :: inside methods that use it.
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
    this::checkIfLegalToChain('findAll')
    checkArgs('findAll', arguments, { maxArgs: 100 })
    return new FindAll(this._sendRequest, this._query, fieldValues)
  }
  find(idOrObject) {
    this::checkIfLegalToChain('find')
    checkArgs('find', arguments)
    return new Find(this._sendRequest, this._query, idOrObject)
  }
  order(fields, direction = 'ascending') {
    this::checkIfLegalToChain('order')
    checkArgs('order', arguments, { minArgs: 1, maxArgs: 2 })
    return new Order(this._sendRequest, this._query, fields, direction)
  }
  above(aboveSpec, bound = 'closed') {
    this::checkIfLegalToChain('above')
    checkArgs('above', arguments, { minArgs: 1, maxArgs: 2 })
    return new Above(this._sendRequest, this._query, aboveSpec, bound)
  }
  below(belowSpec, bound = 'open') {
    this::checkIfLegalToChain('below')
    checkArgs('below', arguments, { minArgs: 1, maxArgs: 2 })
    return new Below(this._sendRequest, this._query, belowSpec, bound)
  }
  limit(size) {
    this::checkIfLegalToChain('limit')
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

  if (pointQuery) {
    let hasEmitted = false
    const seedVal = null
    // Simplest case: just pass through new_val
    return observable
      ::filter(change => !hasEmitted || change.type !== 'state')
      ::scan((previous, change) => {
        hasEmitted = true
        if (change.state === 'synced') {
          return previous
        } else {
          return change.new_val
        }
      }, seedVal)
  } else {
    // Need to track whether anything has been emitted yet, so we can
    // emit an empty array upon receiving a 'synced' state
    // change. Otherwise, we don't want state changes to re-emit the
    // current array.
    let hasEmitted = false
    const seedVal = []
    // Need to incrementally add to and remove from an array
    return observable
      // Filter out state changes since they shouldn't cause us to re-emit
      ::filter(change => !hasEmitted || change.type !== 'state')
      ::scan((previous, change) => {
        const arr = previous.slice()
        switch (change.type) {
        case 'remove':
        case 'uninitial': {
          // Remove old values from the array
          if (change.old_offset != null) {
            arr.splice(change.old_offset, 1)
          } else {
            const index = arr.findIndex(x => x.id === change.old_val.id)
            arr.splice(index, 1)
          }
          break
        }
        case 'add':
        case 'initial': {
          // Add new values to the array
          if (change.new_offset != null) {
            // If we have an offset, put it in the correct location
            arr.splice(change.new_offset, 0, change.new_val)
          } else {
            // otherwise for unordered results, push it on the end
            arr.push(change.new_val)
          }
          break
        }
        case 'change': {
          // Modify in place if a change is happening
          if (change.old_offset != null) {
            // Remove the old document from the results
            arr.splice(change.old_offset, 1)
          }
          if (change.new_offset != null) {
            // Splice in the new val if we have an offset
            arr.splice(change.new_offset, 0, change.new_val)
          } else {
            // If we don't have an offset, find the old val and
            // replace it with the new val
            const index = arr.findIndex(x => x.id === change.old_val.id)
            arr[index] = change.new_val
          }
          break
        }
        case 'state': {
          // This gets hit if we have not emitted yet, and should
          // result in an empty array being output.
          break
        }
        default:
          throw new Error(
            `unrecognized 'type' field from server ${JSON.stringify(change)}`)
        }
        hasEmitted = true
        return arr
      }, seedVal)
  }
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
    return Observable::empty()
  }
  const options = Object.assign(
    {}, this._query, { data: serialize(wrappedDocs) })
  let observable = this._sendRequest(name, options)
  if (!this._lazyWrites) {
    // Need to buffer response since this becomes a hot observable and
    // when we subscribe matters
    observable = observable::publishReplay().refCount()
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
    return this::writeOp('store', arguments, documents)
  }
  upsert(documents) {
    return this::writeOp('upsert', arguments, documents)
  }
  insert(documents) {
    return this::writeOp('insert', arguments, documents)
  }
  replace(documents) {
    return this::writeOp('replace', arguments, documents)
  }
  update(documents) {
    return this::writeOp('update', arguments, documents)
  }
  remove(documentOrId) {
    const wrapped = validIndexValue(documentOrId) ?
          { id: documentOrId } : documentOrId
    return this::writeOp('remove', arguments, wrapped)
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
    return this::writeOp('removeAll', arguments, wrapped)
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
