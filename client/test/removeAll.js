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

export default function removeAllSuite(getData) {
  return () => {
  let data
  const testData = [
    {id: 1, a: 1},
    {id: 2, a: 2},
    {id: 3, a: 3},
    {id: 4, a: 4},
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

  // All right, let's remove a document. The promise resolves with no
  // arguments.
  it('removes documents when an array of ids is passed', assertCompletes(() =>
    data.removeAll([1])
      .do(res => compareWithoutVersion(res, {id: 1}))
      // Let's make sure the removed document isn't there
      .mergeMapTo(data.find(1).fetch())
      // Let's make sure the removed document isn't there
      .do(res => assert.isNull(res))
  ))

  // Passing an array of objects to `removeAll` is also ok.
  it('removes documents when array elements are objects', assertCompletes(() =>
    data.removeAll([{id: 2}])
      .do(res => compareWithoutVersion(res, {id: 2}))
      // Let's make sure the removed document isn't there
      .mergeMapTo(data.find(2).fetch())
      // Let's make sure the removed document isn't there
      .do(res => assert.isNull(res))
  ))

  // We can also remove multiple documents
  it('removes multiple documents by id or as objects', assertCompletes(() =>
    data.removeAll([3, 50, {id: 4}]).toArray()
      .do(res => compareWithoutVersion(res, [{id: 3}, {id: 50}, {id: 4}]))
      // Let's make sure the removed document isn't there
      .mergeMapTo(data.findAll(3, 50, 4).fetch())
      // Let's make sure the removed document isn't there
      .do(res => assert.deepEqual(res, []))
  ))

  // Removing a missing document shouldn't generate an error.
  it('removes a non-existent document without error', assertCompletes(() =>
    data.removeAll(['abracadabra'])
      .do(res => assert.deepEqual(res, {id: 'abracadabra'})),
    /document was missing/
  ))

  // Calling `removeAll` with an empty array is also ok.
  it(`doesn't error when an empty array is passed`, assertCompletes(() =>
    data.removeAll([])
      .do(res => assert.fail())
  ))

  // But an array with a `null` is an error.
  it('errors when a null in an array is passed', assertErrors(() =>
    data.removeAll([null]),
    /Primary keys must be either a number, string, bool, pseudotype or array/
  ))

  // Calling `removeAll` with anything but a single array is an error.
  it('throws when no arguments are passed', assertErrors(
    () => data.removeAll(),
    /removeAll must be given an array of objects or ids/
  ))
  it('throws when more than one argument is passed', assertErrors(
    () => data.removeAll([1], 2),
    /removeAll must be given an array of objects or ids/
  ))
  it('throws when null is passed', assertErrors(
    () => data.removeAll(null),
    /removeAll must be given an array of objects or ids/
  ))
  it('throws when passed a number', assertErrors(
    () => data.removeAll(1),
    /removeAll must be given an array of objects or ids/
  ))
  it('throws when passed a string', assertErrors(
    () => data.removeAll('1'),
    /removeAll must be given an array of objects or ids/
  ))
  it('throws when passed an object', assertErrors(
    () => data.removeAll({id: 1}),
    /removeAll must be given an array of objects or ids/
  ))

  // Check that the remaining documents are there
  it(`doesn't remove documents not specified`, assertCompletes(() =>
    data.fetch()
      .map(docs => docs.map(x => x.id))
      .do(res => assert.includeMembers(
        res, ['do_not_remove_1', 'do_not_remove_2']))
  ))
}}
