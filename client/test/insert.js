import { _do as tap } from 'rxjs/operator/do'
import { mergeMapTo } from 'rxjs/operator/mergeMapTo'
import { mergeMap } from 'rxjs/operator/mergeMap'
import { toArray } from 'rxjs/operator/toArray'

import { assertCompletes, assertThrows, assertErrors } from './utils'
const insertSuite = global.insertSuite = getData => () => {
  let data

  before(() => {
    data = getData()
  })

  // The `insert` command stores documents in the database, and errors if
  // the documents already exist.
  it('stores documents in db, errors if documents already exist', assertErrors(() =>
    data.insert({ id: 1, a: 1, b: 1 })::toArray()
      // Should return an array with an ID of the inserted
      // document.
      ::tap(res => assert.deepEqual([ 1 ], res))
      // Let's make sure we get back the document that we put in.
      ::mergeMapTo(data.find(1).fetch())
      // Check that we get back what we put in.
      ::tap(res => assert.deepEqual({ id: 1, a: 1, b: 1 }, res))
      // Let's attempt to overwrite the document now. This should error.
      ::mergeMapTo(data.insert({ id: 1, c: 1 }))
  ))

  // If we insert a document without an ID, the ID is generated for us.
  // Let's run the same test as above (insert the document and then
  // attempt to overwrite it), but have the ID be generated for us.
  it(`generates ids if documents don't already have one`, assertErrors(() => {
    let new_id

    return data.insert({ a: 1, b: 1 })::toArray()
      // should return an array with an ID of the inserted document.
      ::tap(res => {
        assert.isArray(res)
        assert.lengthOf(res, 1)
        assert.isString(res[0])
        new_id = res[0]
      })
      // Let's make sure we get back the document that we put in.
      ::mergeMap(() => data.find(new_id).fetch())
      // Check that we get back what we put in.
      ::tap(res => assert.deepEqual({ id: new_id, a: 1, b: 1 }, res))
      // Let's attempt to overwrite the document now
      ::mergeMap(() => data.insert({ id: new_id, c: 1 }))
  }))

  it('fails if null is passed', assertThrows(
    'The argument to insert must be non-null',
    () => data.insert(null)
  ))

  it('fails if undefined is passed', assertThrows(
    'The 1st argument to insert must be defined',
    () => data.insert(undefined)
  ))

  it('fails if given no argument', assertThrows(
    'insert must receive exactly 1 argument',
    () => data.insert()
  ))

  // The `insert` command allows storing multiple documents in one call.
  // Let's insert a few kinds of documents and make sure we get them back.
  it('can store multiple documents in one call', assertCompletes(() => {
    let new_id_0, new_id_1

    return data.insert([
        {},
        { a: 1 },
        { id: 1, a: 1 },
    ])::toArray()
      ::tap(res => {
        // should return an array with the IDs of the documents in
        // order, including the generated IDS.
        assert.isArray(res)
        assert.lengthOf(res, 3)
        assert.isString(res[0])
        assert.isString(res[1])
        assert.equal(1, res[2])

        new_id_0 = res[0]
        new_id_1 = res[1]
      })
      // Make sure we get what we put in.
      ::mergeMap(() =>
               data.findAll(new_id_0, new_id_1, 1).fetch())
      // We're supposed to get an array of documents we put in
      ::tap(res => assert.sameDeepMembers(res, [
        { id: new_id_0 },
        { id: new_id_1, a: 1 },
        { id: 1, a: 1 },
      ]))
  }))

  // If any operation in a batch insert fails, everything is reported as a
  // failure.
  it('fails if any operation in a batch fails', assertErrors(() =>
    // Lets insert a document that will trigger a duplicate error when we
    // attempt to reinsert it
    data.insert({ id: 2, a: 2 })
      // should return an array with an ID of the inserted document.
      ::tap(res => assert.deepEqual(res, [ 2 ]))
      // Let's make sure we get back the document that we put in.
      ::mergeMap(() => data.find(2).fetch())
      // Check that we get back what we put in.
      ::tap(res => assert.deepEqual(res, { id: 2, a: 2 }))
      // One of the documents in the batch already exists
      ::mergeMap(() => data.insert([
        { id: 1, a: 1 },
        { id: 2, a: 2 },
        { id: 3, a: 3 },
      ]))
  ))

  // Let's trigger a failure in an insert batch again, this time by making
  // one of the documents `null`.
  it('fails if any member of batch is null', assertErrors(() =>
    data.insert([ { a: 1 }, null, { id: 1, a: 1 } ])
  ))

  // Inserting an empty batch of documents is ok, and returns an empty
  // array.
  it('can store empty batches', assertCompletes(() =>
    data.insert([])
      ::tap(res => {
        // should return an array with the IDs of the documents
        // in order, including the generated IDS.
        assert.isArray(res)
        assert.lengthOf(res, 0)
      })
  ))
} // Testing `insert`
