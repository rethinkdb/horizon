import { Observable } from 'rxjs/Observable'

import 'rxjs/add/observable/of'
import 'rxjs/add/observable/forkJoin'
import 'rxjs/add/observable/combineLatest'
import 'rxjs/add/operator/map'

// Other imports
import isPlainObject from 'is-plain-object'

// Unlike normal queries' .watch(), we don't support rawChanges: true
// for aggregates
function checkWatchArgs(args) {
  if (args.length > 0) {
    throw new Error(".watch() on aggregates doesn't support arguments!")
  }
}

function isTerm(term) {
  return typeof term.fetch === 'function' &&
         typeof term.watch === 'function'
}

function isPromise(term) {
  return typeof term.then === 'function'
}

function isObservable(term) {
  return typeof term.subscribe === 'function' &&
         typeof term.lift === 'function'
}

// Whether an object is primitive. We consider functions
// non-primitives, lump Dates and ArrayBuffers into primitives.
function isPrimitive(value) {
  if (value === null) {
    return true
  }
  if (value === undefined) {
    return false
  }
  if (typeof value === 'function') {
    return false
  }
  if ([ 'boolean', 'number', 'string' ].indexOf(typeof value) !== -1) {
    return true
  }
  if (value instanceof Date || value instanceof ArrayBuffer) {
    return true
  }
  return false
}

// Simple wrapper for primitives. Just emits the primitive
class PrimitiveTerm {
  constructor(value) {
    this._value = value
  }

  toString() {
    return this._value.toString()
  }

  fetch() {
    return Observable.of(this._value)
  }

  watch(...watchArgs) {
    checkWatchArgs(watchArgs)
    return Observable.of(this._value)
  }
}

// Simple wrapper for observables to normalize the
// interface. Everything in an aggregate tree should be one of these
// term-likes
class ObservableTerm {
  constructor(value) {
    this._value = value
  }

  toString() {
    return this._value.toString()
  }

  fetch() {
    return Observable.from(this._value)
  }

  watch(...watchArgs) {
    checkWatchArgs(watchArgs)
    return Observable.from(this._value)
  }
}

// Handles aggregate syntax like [ query1, query2 ]
class ArrayTerm {
  constructor(value) {
    // Ensure this._value is an array of Term
    this._value = value.map(x => aggregate(x))
  }

  _reducer(...args) {
    return args
  }

  _query(operation) {
    return this._value.map(x => x[operation]())
  }

  toString() {
    return `[ ${this._query('toString').join(', ')} ]`
  }

  fetch() {
    if (this._value.length === 0) {
      return Observable.empty()
    }

    const qs = this._query('fetch')
    return Observable.forkJoin(...qs, this._reducer)
  }

  watch(...watchArgs) {
    checkWatchArgs(watchArgs)

    if (this._value.length === 0) {
      return Observable.empty()
    }

    const qs = this._query('watch')
    return Observable.combineLatest(...qs, this._reducer)
  }
}

class AggregateTerm {
  constructor(value) {
    // Ensure this._value is an array of [ key, Term ] pairs
    this._value = Object.keys(value).map(k => [ k, aggregate(value[k]) ])
  }

  _reducer(...pairs) {
    return pairs.reduce((prev, [ k, x ]) => {
      prev[k] = x
      return prev
    }, {})
  }

  _query(operation) {
    return this._value.map(
      ([ k, term ]) => term[operation]().map(x => [ k, x ]))
  }

  toString() {
    const s = this._value.map(([ k, term ]) => `'${k}': ${term}`)
    return `{ ${s.join(', ')} }`
  }

  fetch() {
    if (this._value.length === 0) {
      return Observable.of({})
    }

    const qs = this._query('fetch')
    return Observable.forkJoin(...qs, this._reducer)
  }

  watch(...watchArgs) {
    checkWatchArgs(watchArgs)

    if (this._value.length === 0) {
      return Observable.of({})
    }

    const qs = this._query('watch')
    return Observable.combineLatest(...qs, this._reducer)
  }
}

export function aggregate(spec) {
  if (isTerm(spec)) {
    return spec
  }
  if (isObservable(spec) || isPromise(spec)) {
    return new ObservableTerm(spec)
  }
  if (isPrimitive(spec)) {
    return new PrimitiveTerm(spec)
  }
  if (Array.isArray(spec)) {
    return new ArrayTerm(spec)
  }
  if (isPlainObject(spec)) {
    return new AggregateTerm(spec)
  }

  throw new Error(`Can't make an aggregate with ${spec} in it`)
}

export function model(constructor) {
  return (...args) => aggregate(constructor(...args))
}
