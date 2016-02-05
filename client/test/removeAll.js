'use strict'
const removeAllSuite = getData => () => {
  let data;
  const testData = [
    { id: 1, a: 1 },
    { id: 2, a: 2 },
    { id: 3, a: 3 },
    { id: 4, a: 4 },
    { id: 'do_not_remove_1' },
    { id: 'do_not_remove_2' },
  ]

  before(() => {
    data = getData()
  })

  // Drop all the existing data
  before(done => {
    removeAllData(data, done)
  })

  // Insert the test data and make sure it's in
  before(assertCompletes(() =>
    data.store(testData).ignoreElements()
     .concat(data.fetch({ asCursor: false }))
     // Make sure it's there
     .do(res => assert.sameDeepMembers(res, testData))
  ))

  // All right, let's remove a document. The promise resolves with no
  // arguments.
  it('removes documents when an array of ids is passed', assertCompletes(() =>
    data.removeAll([ 1 ])
      .do(res => assert.equal(res, 1))
      // Let's make sure the removed document isn't there
      .flatMap(data.find(1).fetch())
      // Let's make sure the removed document isn't there
      .do(res => assert.isNull(res))
  ))

  // Passing an array of objects to `removeAll` is also ok.
  it('removes documents when array elements are objects', assertCompletes(() =>
    data.removeAll([ { id: 2 } ])
      .do(res => assert.equal(res, 2))
      // Let's make sure the removed document isn't there
      .flatMap(data.find(2).fetch())
      // Let's make sure the removed document isn't there
      .do(res => assert.isNull(res))
  ))

  // We can also remove multiple documents
  it('removes multiple documents by id or as objects', assertCompletes(() =>
    data.removeAll([ 3, 50, { id: 4 } ]).toArray()
      .do(res => assert.deepEqual(res, [ 3, 50, 4 ]))
      // Let's make sure the removed document isn't there
      .flatMap(data.findAll(3, 50, 4).fetch({ asCursor: false }))
      // Let's make sure the removed document isn't there
      .do(res => assert.deepEqual(res, []))
  ))

  // Removing a missing document shouldn't generate an error.
  it('removes a non-existent document without error', assertCompletes(() =>
    data.removeAll([ 'abracadabra' ])
      .do(res => assert.equal(res, 'abracadabra'))
  ))

  // Calling `removeAll` with an empty array is also ok.
  it(`doesn't error when an empty array is passed`, assertCompletes(() =>
    data.removeAll([])
      .do(res => assert.fail())
  ))

  // But an array with a `null` is an error.
  it('errors when a null in an array is passed', assertErrors(() =>
    data.removeAll([ null ])
  ))

  // If one thing fails, everything is reported as a failure.
  it('reports failure if anything in a batch fails', assertErrors(() =>
    data.removeAll([ 3, null, { id: 4 } ])
  ))

  // Calling `removeAll` with anything but a single array is an error.
  it('throws when no arguments are passed', assertThrows(
    'removeAll takes an array as an argument',
    () => data.removeAll()
  ))
  it('throws when more than one argument is passed', assertThrows(
    'removeAll must receive exactly 1 argument',
    () => data.removeAll([ 1 ], 2)
  ))
  it('throws when null is passed', assertThrows(
    'removeAll takes an array as an argument',
    () => data.removeAll(null)
  ))
  it('throws when passed a number', assertThrows(
    'removeAll takes an array as an argument',
    () => data.removeAll(1)
  ))
  it('throws when passed a string', assertThrows(
    'removeAll takes an array as an argument',
    () => data.removeAll('1')
  ))
  it('throws when passed an object', assertThrows(
    'removeAll takes an array as an argument',
    () => data.removeAll({ id: 1 })
  ))

  // Check that the remaining documents are there
  it(`doesn't remove documents not specified`, assertCompletes(() =>
    data.fetch().pluck('id').toArray()
      .do(res => assert.includeMembers(
        res, [ 'do_not_remove_1', 'do_not_remove_2' ]))
  ))
} // Testing `removeAll`
