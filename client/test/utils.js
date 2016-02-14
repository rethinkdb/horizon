'use strict'
window.removeAllData = function removeAllData(collection, done) {
  // Read all elements from the collection
  collection.fetch({ asCursor: false }) // all documents in the collection
    .flatMap(docs => collection.removeAll(docs))
    .flatMap(() => collection.fetch())
    .toArray()
    .do(remaining => assert.deepEqual([], remaining))
    .subscribe(doneObserver(done))
}

// Used to subscribe to observables and call done appropriately
function doneObserver(done) {
  return Rx.Observer.create(
    () => {},
    err => done(new Error(err)),
    () => done()
  )
}

// Used to subscribe to observables when an error is expected
function doneErrorObserver(done) {
  return Rx.Observer.create(
    () => {},
    () => done(),
    () => done(new Error('Unexpectedly completed'))
  )
}

// Used to check for stuff that should throw an exception, rather than
// erroring the observable stream
window.assertThrows = function assertThrows(message, callback) {
  const f = done => {
    try {
      callback()
      done(new Error(`Didn't throw an exception`))
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

window.assertCompletes = function assertCompletes(observable) {
  const f = done => observable().subscribe(doneObserver(done))
  f.toString = () => `assertCompletes(\n(${observable}\n)`
  return f
}

window.assertErrors = function assertErrors(observable) {
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
window.observableInterleave = function observableInterleave(options) {
  const query = options.query
  const operations = options.operations
  const expected = options.expected
  const equality = options.equality || assert.deepEqual
  const debug = options.debug || (() => {})
  const values = []
  return query
    .take(expected.length)
    .do(debug)
    .flatMap((val, i) => {
      values.push(val)
      if (i < operations.length) {
        return operations[i].ignoreElements()
      } else {
        return Rx.Observable.empty()
      }
    })
    .do(null, null, () => equality(values, expected))
}
