import { Observable } from 'rxjs/Observable'
// Observable static methods
import { merge } from 'rxjs/observable/merge'
import { of } from 'rxjs/observable/of'
import { forkJoin } from 'rxjs/observable/forkJoin'

// Observable operators
import { map } from 'rxjs/operator/map'
import { _do as tap } from 'rxjs/operator/do'
import { combineLatest } from 'rxjs/operator/combineLatest'

// Other imports
import isPlainObject from 'is-plain-object'

// Project imports
import { isRecursivelyPrimitive } from './util/is-recursively-primitive'

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

// Simple wrapper for primitives. Just emits the primitive
class PrimitiveTerm {
  constructor(value) {
    this._value = value
  }

  toString() {
    return this._value.toString()
  }

  fetch() {
    return Observable::of(this._value)
  }

  watch() {
    checkWatchArgs(arguments)
    return Observable::of(this._value)
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

  watch() {
    checkWatchArgs(arguments)
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
    return Observable::forkJoin(...qs, (...args) =>
                                Array.prototype.concat(...args))
  }

  watch() {
    checkWatchArgs(arguments)
    const qs = this._subqueries.map(x => x.watch())
    if (qs.length === 0) {
      return Observable.empty()
    } else if (qs.length === 1) {
      return qs[0]
    } else {
      const headQuery = qs[0]
      const tailQueries = qs.slice(1)
      return headQuery::combineLatest(...tailQueries, args => {
        console.log('args', args)
        return Array.prototype.concat(...args)
      })
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
    this._aggregateKeys.forEach(([k, v]) => {
      string += ` '${k}': ${v},`
    })
    string += ' }'
    return string
  }

  fetch() {
    const observs = this._aggregateKeys.map(([ k, term ]) => {
      // We jam the key into the observable so when it emits we know
      // where to put it in the object
      return term.fetch()::map(val => [ k, val ])
    })
    return Observable::forkJoin(...observs, (...keyVals) => {
      // reconstruct the object
      const finalObject = {}
      for (const [ key, val ] of keyVals) {
        finalObject[key] = val
      }
      return finalObject
    })
  }

  watch() {
    checkWatchArgs(arguments)
    const observs = this._aggregateKeys.map(([ k, term ]) => {
      return term.watch()::map(val => [ k, val ])
    })
    return Observable::combineLatest(...observs, (...keyVals) => {
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
  } else if (isRecursivelyPrimitive(aggregateSpec)) {
    return new PrimitiveTerm(aggregateSpec)
  } else if (Array.isArray(aggregateSpec)) {
    return new ArrayTerm(aggregateSpec)
  } else if (isPlainObject(aggregateSpec)) {
    return new AggregateTerm(aggregateSpec)
  } else {
    throw new Error(`Can\'t make an aggregate with ${aggregateSpec} in it`)
  }
}

export function model(constructor) {
  return (...args) => aggregate(constructor(...args))
}
