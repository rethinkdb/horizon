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

function hasTermInterface(possibleTerm) {
  return typeof possibleTerm.fetch === 'function' &&
         typeof possibleTerm.watch === 'function'
}

function hasObservableInterface(possibleObservable) {
  return typeof possibleObservable.subscribe === 'function' &&
         typeof possibleObservable.lift === 'function'
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
    this._obs = value
  }

  toString() {
    return this._obs.toString()
  }

  fetch() {
    return this._obs
  }

  watch(...watchArgs) {
    checkWatchArgs(watchArgs)
    return this._obs
  }
}

// Handles aggregate syntax like [ query1, query2 ]
class ArrayTerm {
  constructor(queries) {
    // Ensure this._queries is an array of observables
    this._subqueries = queries.map(x => aggregate(x))
  }

  toString() {
    return `[ ${this._subqueries.map(x => x.toString()).join(', ')} ]`
  }

  fetch() {
    // Convert each query to an observable
    const qs = this._subqueries.map(x => x.fetch())
    // Merge the results of all of the observables into one array
    const concat = Array.prototype.concat.bind(Array.prototype)
    return Observable.forkJoin(...qs, concat)
  }

  watch(...watchArgs) {
    checkWatchArgs(watchArgs)
    const qs = this._subqueries.map(x => x.watch())
    if (qs.length === 0) {
      return Observable.empty()
    } else if (qs.length === 1) {
      return qs[0]
    } else {
      return Observable.combineLatest(...qs, (...args) =>
        Array.prototype.concat(...args))
    }
  }
}

class AggregateTerm {
  constructor(aggregateObject) {
    this._aggregateKeys = Object.keys(aggregateObject).map(key =>
      [ key, aggregate(aggregateObject[key]) ])
  }

  toString() {
    let string = '{'
    this._aggregateKeys.forEach(([ k, v ]) => {
      string += ` '${k}': ${v},`
    })
    string += ' }'
    return string
  }

  fetch() {
    const observs = this._aggregateKeys.map(([ k, term ]) =>
      // We jam the key into the observable so when it emits we know
      // where to put it in the object
      term.fetch().map(val => [ k, val ]))
    const invocation = btoa(Math.random()).slice(0, 5)
    console.log(invocation, 'bout to forkJoin', observs)
    return Observable.forkJoin(...observs, (...keyVals) => {
      console.log(invocation, 'forkJoin is joinin!', keyVals)
      // reconstruct the object
      const finalObject = {}
      for (const [ key, val ] of keyVals) {
        finalObject[key] = val
      }
      return finalObject
    })
  }

  watch(...watchArgs) {
    checkWatchArgs(watchArgs)
    const observs = this._aggregateKeys.map(([ k, term ]) =>
      term.watch().map(val => [ k, val ]))
    return Observable.combineLatest(...observs, (...keyVals) => {
      const finalObject = {}
      for (const [ key, val ] of keyVals) {
        finalObject[key] = val
      }
      return finalObject
    })
  }
}

export function aggregate(aggregateSpec) {
  if (hasTermInterface(aggregateSpec)) {
    return aggregateSpec
  } else if (hasObservableInterface(aggregateSpec)) {
    return new ObservableTerm(aggregateSpec)
  } else if (isPrimitive(aggregateSpec)) {
    return new PrimitiveTerm(aggregateSpec)
  } else if (Array.isArray(aggregateSpec)) {
    return new ArrayTerm(aggregateSpec)
  } else if (isPlainObject(aggregateSpec)) {
    return new AggregateTerm(aggregateSpec)
  } else {
    throw new Error(`Can't make an aggregate with ${aggregateSpec} in it`)
  }
}

export function model(constructor) {
  return (...args) => aggregate(constructor(...args))
}
