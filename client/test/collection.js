import 'rxjs/add/operator/do'
import 'rxjs/add/operator/toArray'

import {assertCompletes, removeAllData, compareSetsWithoutVersion} from './utils'

export default function collectionSuite(getHorizon, getData, getTestData) {
  return () => {
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
      .do(res => compareSetsWithoutVersion(testData, res))
  ))

  // Reading from an empty collection should result in an empty array
  it('returns an empty array from an empty collection', assertCompletes(() =>
    empty_collection.fetch()
      .do(res => compareSetsWithoutVersion(res, []))
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
}}
