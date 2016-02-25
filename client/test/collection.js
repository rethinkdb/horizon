'use strict'
const collectionSuite = window.collectionSuite = (getHorizon, getData, getTestData) => () => {
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
    data.fetch({ asCursor: false })
      .do(res => assert.sameDeepMembers(testData, res))
  ))

  // Reading from an empty collection should result in an empty array
  it('returns an empty array from an empty collection', assertCompletes(() =>
    empty_collection.fetch({ asCursor: false })
      .do(res => assert.sameDeepMembers(res, []))
  ))
} // Testing full collection reads
