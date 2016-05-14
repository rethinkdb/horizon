import { _do as tap } from 'rxjs/operator/do'
import { toArray } from 'rxjs/operator/toArray'

import { assertCompletes, removeAllData } from './utils'

const collectionSuite = global.collectionSuite = (getHorizon, getData, getTestData) => () => {
  let horizon, data, testData, empty_collection

  before(() => {
    horizon = getHorizon()
    data = getData()
    testData = getTestData()
  })

  // We'll need a separate empty collection
  before(done => {
    empty_collection = horizon('empty_test_collection')
    removeAllData(empty_collection, done)
  })

  // Grab everything from the collection.
  it('allows getting all values from the collection', assertCompletes(() =>
    data.fetch()
      ::tap(res => assert.sameDeepMembers(testData, res))
  ))

  // Reading from an empty collection should result in an empty array
  it('returns an empty array from an empty collection', assertCompletes(() =>
    empty_collection.fetch()
      ::tap(res => assert.sameDeepMembers(res, []))
  ))

  // Test forEach for promise behavior
  it('Allows iterating over the entire collection', done => {
    let didSomething = false
    data.fetch().forEach(results => {
      didSomething = true
    }).then(() => {
      if (didSomething) {
        done()
      } else {
        done(new Error("Didn't do anything"))
      }
    }).catch(err => done(err))
  })
} // Testing full collection reads
