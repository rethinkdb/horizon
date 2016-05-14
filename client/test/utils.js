import { Observable } from 'rxjs/Observable'
import { empty } from 'rxjs/observable/empty'
import { toArray } from 'rxjs/operator/toArray'
import { _do as tap } from 'rxjs/operator/do'
import { mergeMap } from 'rxjs/operator/mergeMap'
import { mergeMapTo } from 'rxjs/operator/mergeMapTo'
import { take } from 'rxjs/operator/take'
import { ignoreElements } from 'rxjs/operator/ignoreElements'

export function removeAllDataObs(collection) {
  // Read all elements from the collection
  return collection.fetch() // all documents in the collection
    ::tap()
    ::mergeMap(docs => collection.removeAll(docs))
    ::mergeMapTo(collection.fetch())
    ::tap(remaining => assert.deepEqual([], remaining))
}

export function removeAllData(collection, done) {
  removeAllDataObs(collection).subscribe(doneObserver(done))
}

// Used to subscribe to observables and call done appropriately
function doneObserver(done) {
  return {
    next() {},
    error(err = new Error()) { done(err) },
    complete() { done() },
  }
}

// Used to subscribe to observables when an error is expected
function doneErrorObserver(done) {
  return {
    next() {},
    error() { done() },
    complete() { done(new Error('Unexpectedly completed')) },
  }
}

// Used to check for stuff that should throw an exception, rather than
// erroring the observable stream
export function assertThrows(message, callback) {
  const f = done => {
    try {
      callback()
      done(new Error("Didn't throw an exception"))
    } catch (err) {
      if (err.message === message) {
        done()
      } else {
        done(new Error(`Threw the wrong exception. ` +
                       `Expected "${message}", got "${err.message}"`))
      }
    }
  }
  f.toString = () => `assertThrows(\n'${message}',\n  ${callback}\n)`
  return f
}

export function assertCompletes(observable) {
  const f = done => observable().subscribe(doneObserver(done))
  f.toString = () => `assertCompletes(\n(${observable}\n)`
  return f
}

export function assertErrors(observable) {
  const f = done => observable().subscribe(doneErrorObserver(done))
  f.toString = () => observable.toString()
  return f
}

// Useful for asynchronously interleaving server actions with a
// changefeed and testing the changes are as expected.
//
// Takes a sequence of actions and a changefeed query. Executes the
// next action every time a value comes in over the feed. Asserts that
// the expected values are returned from the final observable. The
// changefeed is automatically limited to the length of the expected
// array. Accepts a `debug` argument that receives every element in
// the changefeed
export function observableInterleave(options) {
  const query = options.query
  const operations = options.operations
  const expected = options.expected
  const equality = options.equality || assert.deepEqual
  const debug = options.debug || (() => {})
  const values = []
  return query
    ::take(expected.length)
    ::tap(debug)
    ::mergeMap((val, i) => {
      values.push(val)
      if (i < operations.length) {
        return operations[i]::ignoreElements()
      } else {
        return Observable::empty()
      }
    })
    ::tap({ complete() { equality(expected, values) } })
}
