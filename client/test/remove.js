import 'rxjs/add/operator/do'
import 'rxjs/add/operator/mergeMapTo'
import 'rxjs/add/operator/toArray'
import 'rxjs/add/operator/concat'
import 'rxjs/add/operator/map'
import 'rxjs/add/operator/ignoreElements'

import {assertCompletes,
        assertThrows,
        assertErrors,
        removeAllData,
        compareWithoutVersion,
        compareSetsWithoutVersion} from './utils'

export default function removeSuite(getData) {
  return () => {
  let data
  const testData = [
    {id: 1, a: 1},
    {id: 2, a: 2},
    {id: 3, a: 3},
    {id: 'do_not_remove_1'},
    {id: 'do_not_remove_2'},
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
      .concat(data.fetch())
      // Make sure it's there
      .do(res => compareSetsWithoutVersion(res, testData))
  ))

  it('removes a document when passed an id', assertCompletes(() =>
    data.remove(1)
      .do(res => compareWithoutVersion(res, {id: 1}))
      // Let's make sure the removed document isn't there
      .mergeMapTo(data.find(1).fetch())
      // Let's make sure the removed document isn't there
      .do(res => assert.isNull(res))
  ))

  it('removes a document with an id field', assertCompletes(() =>
    data.remove({id: 2})
      .do(res => compareWithoutVersion(res, {id: 2}))
      // Let's make sure the removed document isn't there
      .mergeMapTo(data.find(2).fetch())
      // Let's make sure the removed document isn't there
      .do(res => assert.isNull(res))
  ))

  it(`removing a document that doesn't exist doesn't error`, assertCompletes(() =>
    data.remove('abracadabra').do(res => assert.deepEqual(res, {id: 'abracadabra'}))
  ))

  it('fails when called with no arguments', assertErrors(
    () => data.remove(),
    /remove must be given a single object or id/
  ))

  it('fails when called with null', assertErrors(
    () => data.remove(null),
    /Primary keys must be either a number, string, bool, pseudotype or array/
  ))

  // Give an error if the user tries to use varargs (to help avoid
  // confusion)
  it('fails when called with more than one argument', assertErrors(
    () => data.remove(1, 2),
    /remove must be given a single object or id/
  ))

  // Check that the remaining documents are there
  it(`doesn't remove documents we didn't ask it to`, assertCompletes(() =>
    data.fetch()
      .map(docs => docs.map(x => x.id))
      .do(res => assert.includeMembers(
        res, ['do_not_remove_1', 'do_not_remove_2']))
  ))
}}
