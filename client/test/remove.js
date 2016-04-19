'use strict'
const removeSuite = window.removeSuite = getData => () => {
  let data
  const testData = [
    { id: 1, a: 1 },
    { id: 2, a: 2 },
    { id: 3, a: 3 },
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
      .concat(data.fetch().toArray())
      // Make sure it's there
      .do(res => assert.sameDeepMembers(res, testData))
  ))

  it('removes a document when passed an id', assertCompletes(() =>
    data.remove(1)
      .do(res => assert.equal(res, 1))
      // Let's make sure the removed document isn't there
      .mergeMap(() => data.find(1).fetch())
      // Let's make sure the removed document isn't there
      .do(res => assert.isNull(res))
  ))

  it('removes a document with an id field', assertCompletes(() =>
    data.remove({ id: 2 })
      .do(res => assert.equal(res, 2))
      // Let's make sure the removed document isn't there
      .mergeMap(() => data.find(2).fetch())
      // Let's make sure the removed document isn't there
      .do(res => assert.isNull(res))
  ))

  it(`removing a document that doesn't exist doesn't error`, assertCompletes(() =>
    data.remove('abracadabra').do(res => assert.equal(res, 'abracadabra'))
  ))

  it('fails when called with no arguments', assertThrows(
    'remove must receive exactly 1 argument',
    () => data.remove()
  ))

  it('fails when called with null', assertThrows(
    'The argument to remove must be non-null',
    () => data.remove(null)
  ))

  // Give an error if the user tries to use varargs (to help avoid
  // confusion)
  it('fails when called with more than one argument', assertThrows(
    'remove must receive exactly 1 argument',
    () => data.remove(1, 2)
  ))

  // Check that the remaining documents are there
  it(`doesn't remove documents we didn't ask it to`, assertCompletes(() =>
    data.fetch()
      .pluck('id')
      .toArray()
      .do(res => assert.includeMembers(
        res, [ 'do_not_remove_1', 'do_not_remove_2' ]))
  ))
} // Testing `remove`
