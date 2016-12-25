import {Observable} from 'rxjs/Observable'
import 'rxjs/add/observable/empty'
import 'rxjs/add/operator/toArray'
import 'rxjs/add/operator/do'
import 'rxjs/add/operator/mergeMap'
import 'rxjs/add/operator/mergeMapTo'
import 'rxjs/add/operator/take'
import 'rxjs/add/operator/ignoreElements'

export function removeAllDataObs(collection) {
  // Read all elements from the collection
  return collection.fetch() // all documents in the collection
    .do()
    .mergeMap(docs => collection.removeAll(docs))
    .mergeMapTo(collection.fetch())
    .do(remaining => assert.deepEqual([], remaining))
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
function doneErrorObserver(done, regex) {
  return {
    next() {},
    error(err) {
      this.finished = true
      if (regex && regex.test(err.message)) {
        done()
      } else {
        done(err)
      }
    },
    complete() {
      if (!this.finished) {
        done(new Error('Unexpectedly completed'))
      }
    },
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
        done(new Error('Threw the wrong exception. ' +
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

export function assertErrors(observable, regex) {
  const f = done => observable().subscribe(doneErrorObserver(done, regex))
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
  const equality = options.equality || compareWithoutVersion
  const debug = options.debug || (() => {})
  const values = []
  return query
    .take(expected.length)
    .do(debug)
    .mergeMap((val, i) => {
      values.push(val)
      if (i < operations.length) {
        return operations[i].ignoreElements()
      } else {
        return Observable.empty()
      }
    })
    .do({complete() { equality(expected, values) }})
}

const withoutVersion = function withoutVersion(value) {
  if (Array.isArray(value)) {
    return value.map(withoutVersion);
  } else if (typeof value === 'object') {
    const modified = Object.assign({}, value)
    delete modified['$hz_v$']
    Object.keys(modified).forEach((k, v) => {
      modified[k] = withoutVersion(modified[k]);
    })
    return modified
  } else {
    return value
  }
}

// Compare write results - ignoring the new version field ($hz_v$)
export function compareWithoutVersion(actual, expected, message) {
  return assert.deepEqual(withoutVersion(actual),
                          withoutVersion(expected),
                          message)
}

export function compareSetsWithoutVersion(actual, expected, message) {
  return assert.sameDeepMembers(withoutVersion(actual),
                                withoutVersion(expected),
                                message)
}
