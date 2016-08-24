import { Observable } from 'rxjs/Observable'
import 'rxjs/add/observable/empty'

import 'rxjs/add/operator/publishReplay'
import 'rxjs/add/operator/scan'
import 'rxjs/add/operator/filter'
import 'rxjs/add/operator/map'
import 'rxjs/add/operator/toArray'
import 'rxjs/add/operator/defaultIfEmpty'
import 'rxjs/add/operator/ignoreElements'
import 'rxjs/add/operator/merge'
import 'rxjs/add/operator/mergeMap'
import 'rxjs/add/operator/take'

import snakeCase from 'snake-case'
import deepEqual from 'deep-equal'

import checkArgs from './util/check-args'
import validIndexValue from './util/valid-index-value.js'
import { serialize } from './serialization.js'

import watchRewrites from './hacks/watch-rewrites'


/**
 @this TermBase

 Validation check to throw an exception if a method is chained onto a
 query that already has it. It belongs to TermBase, but we don't want
 to pollute the objects with it (since it isn't useful to api users),
 so it's dynamically bound with .call inside methods that use it.
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
export class TermBase {
  constructor(sendRequest, query, legalMethods) {
    this._sendRequest = sendRequest
    this._query = query
    this._legalMethods = legalMethods
  }

  toString() {
    let string = `Collection('${this._query.collection}')`
    if (this._query.find) {
      string += `.find(${JSON.stringify(this._query.find)})`
    }
    if (this._query.find_all) {
      string += `.findAll(${JSON.stringify(this._query.find_all)})`
    }
    if (this._query.order) {
      string += `.order(${JSON.stringify(this._query.order[0])}, ` +
                       `${JSON.stringify(this._query.order[1])})`
    }
    if (this._query.above) {
      string += `.above(${JSON.stringify(this.query.above[0])}, ` +
                       `${JSON.stringify(this.query.above[1])})`
    }
    if (this._query.below) {
      string += `.below(${JSON.stringify(this.query.below[0])}, ` +
                       `${JSON.stringify(this.query.below[1])})`
    }
    if (this._query.limit) {
      string += '.limit(this._query.limit))'
    }
    return string
  }
  // Returns a sequence of the result set. Every time it changes the
  // updated sequence will be emitted. If raw change objects are
  // needed, pass the option 'rawChanges: true'. An observable is
  // returned which will lazily emit the query when it is subscribed
  // to
  watch({ rawChanges = false } = {}) {
    const query = watchRewrites(this, this._query)
    const raw = this._sendRequest('subscribe', query)
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
    const raw = this._sendRequest('query', this._query).map(val => {
      delete val.$hz_v$
      return val
    })
    if (this._query.find) {
      return raw.defaultIfEmpty(null)
    } else {
      return raw.toArray()
    }
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

  if (pointQuery) {
    let hasEmitted = false
    const seedVal = null
    // Simplest case: just pass through new_val
    return observable
      .filter(change => !hasEmitted || change.type !== 'state')
      .scan((previous, change) => {
        hasEmitted = true
        if (change.new_val != null) {
          delete change.new_val.$hz_v$
        }
        if (change.old_val != null) {
          delete change.old_val.$hz_v$
        }
        if (change.state === 'synced') {
          return previous
        } else {
          return change.new_val
        }
      }, seedVal)
  } else {
    const seedVal = { emitted: false, val: [] }
    return observable
      .scan((state, change) => {
        if (change.new_val != null) {
          delete change.new_val.$hz_v$
        }
        if (change.old_val != null) {
          delete change.old_val.$hz_v$
        }
        if (change.state === 'synced') {
          state.emitted = true
        }
        state.val = applyChange(state.val.slice(), change)
        return state
      }, seedVal)
      .filter(state => state.emitted)
      .map(x => x.val)
  }
}

export function applyChange(arr, change) {
  switch (change.type) {
  case 'remove':
  case 'uninitial': {
    // Remove old values from the array
    if (change.old_offset != null) {
      arr.splice(change.old_offset, 1)
    } else {
      const index = arr.findIndex(x => deepEqual(x.id, change.old_val.id))
      if (index === -1) {
        // Programming error. This should not happen
        throw new Error(
          `change couldn't be applied: ${JSON.stringify(change)}`)
      }
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
      const index = arr.findIndex(x => deepEqual(x.id, change.old_val.id))
      if (index === -1) {
        // indicates a programming bug. The server gives us the
        // ordering, so if we don't find the id it means something is
        // buggy.
        throw new Error(
          `change couldn't be applied: ${JSON.stringify(change)}`)
      }
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
  return arr
}

/** @this Collection
 Implements writeOps for the Collection class
*/
function writeOp(name, args, documents) {
  checkArgs(name, args)
  let isBatch = true
  let wrappedDocs = documents
  if (!Array.isArray(documents)) {
    // Wrap in an array if we need to
    wrappedDocs = [ documents ]
    isBatch = false
  } else if (documents.length === 0) {
    // Don't bother sending no-ops to the server
    return Observable.empty()
  }
  const options = Object.assign(
    {}, this._query, { data: serialize(wrappedDocs) })
  let observable = this._sendRequest(name, options)
  if (isBatch) {
    // If this is a batch writeOp, each document may succeed or fail
    // individually.
    observable = observable.map(
      resp => resp.error ? new Error(resp.error) : resp)
  } else {
    // If this is a single writeOp, the entire operation should fail
    // if any fails.
    const _prevOb = observable
    observable = Observable.create(subscriber => {
      _prevOb.subscribe({
        next(resp) {
          if (resp.error) {
            // TODO: handle error ids when we get them
            subscriber.error(new Error(resp.error))
          } else {
            subscriber.next(resp)
          }
        },
        error(err) { subscriber.error(err) },
        complete() { subscriber.complete() },
      })
    })
  }
  if (!this._lazyWrites) {
    // Need to buffer response since this becomes a hot observable and
    // when we subscribe matters
    observable = observable.publishReplay().refCount()
    observable.subscribe()
  }
  return observable
}

export class Collection extends TermBase {
  constructor(sendRequest, collectionName, lazyWrites) {
    const query = { collection: collectionName }
    const legalMethods = [
      'find', 'findAll', 'order', 'above', 'below', 'limit' ]
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

export class Find extends TermBase {
  constructor(sendRequest, previousQuery, idOrObject) {
    const findObject = validIndexValue(idOrObject) ?
          { id: idOrObject } : idOrObject
    const query = Object.assign({}, previousQuery, { find: findObject })
    super(sendRequest, query, [])
  }
}

export class FindAll extends TermBase {
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

export class Above extends TermBase {
  constructor(sendRequest, previousQuery, aboveSpec, bound) {
    const option = { above: [ aboveSpec, bound ] }
    const query = Object.assign({}, previousQuery, option)
    const legalMethods = [ 'findAll', 'order', 'below', 'limit' ]
    super(sendRequest, query, legalMethods)
  }
}

export class Below extends TermBase {
  constructor(sendRequest, previousQuery, belowSpec, bound) {
    const options = { below: [ belowSpec, bound ] }
    const query = Object.assign({}, previousQuery, options)
    const legalMethods = [ 'findAll', 'order', 'above', 'limit' ]
    super(sendRequest, query, legalMethods)
  }
}

export class Order extends TermBase {
  constructor(sendRequest, previousQuery, fields, direction) {
    const wrappedFields = Array.isArray(fields) ? fields : [ fields ]
    const options = { order: [ wrappedFields, direction ] }
    const query = Object.assign({}, previousQuery, options)
    const legalMethods = [ 'findAll', 'above', 'below', 'limit' ]
    super(sendRequest, query, legalMethods)
  }
}

export class Limit extends TermBase {
  constructor(sendRequest, previousQuery, size) {
    const query = Object.assign({}, previousQuery, { limit: size })
    // Nothing is legal to chain after .limit
    super(sendRequest, query, [])
  }
}


export class UserDataTerm {
  constructor(hz, handshake, socket) {
    this._hz = hz
    this._before = socket.ignoreElements().merge(handshake)
  }

  _query(userId) {
    return this._hz('users').find(userId)
  }

  fetch() {
    return this._before.mergeMap(handshake => {
        if (handshake.id == null) {
          throw new Error('Unauthenticated users have no user document')
        } else {
          return this._query(handshake.id).fetch()
        }
      }).take(1) // necessary so that we complete, since _before is
                 // infinite
  }

  watch(...args) {
    return this._before.mergeMap(handshake => {
      if (handshake.id === null) {
        throw new Error('Unauthenticated users have no user document')
      } else {
        return this._query(handshake.id).watch(...args)
      }
    })
  }
}
