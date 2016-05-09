'use strict'
import { _do as tap } from 'rxjs/operator/do'
import { mergeMapTo } from 'rxjs/operator/mergeMapTo'
import { toArray } from 'rxjs/operator/toArray'

const updateSuite = window.updateSuite = getData => () => {
  let data

  before(() => {
    data = getData()
  })

  // Let's store a document first, then update it.
  it('allows updating an existing document', assertCompletes(() =>
    data.store({ id: 1, a: { b: 1, c: 1 }, d: 1 })::toArray()
      // should return an array with an ID of the inserted document.
      ::tap(res => assert.deepEqual([ 1 ], res))
      // Let's make sure we get back the document that we put in.
      ::mergeMapTo(data.find(1).fetch())
      // Check that we get back what we put in.
      ::tap(res => assert.deepEqual(res, { id: 1, a: { b: 1, c: 1 }, d: 1 }))
      // Let's update the document now
      ::mergeMapTo(data.update({ id: 1, a: { c: 2 } }))::toArray()
      // We should have gotten the ID back again
      ::tap((res) => assert.deepEqual([ 1 ], res))
      // Make sure `upsert` updated the original document
      ::mergeMapTo(data.find(1).fetch())
      // Check that the document was updated correctly
      ::tap(res => assert.deepEqual(res, { id: 1, a: { b: 1, c: 2 }, d: 1 }))
  ))

  // The `update` command updates documents already in the database. It
  // errors if the document doesn't exist.
  it(`fails if document doesn't exist`, assertErrors(() =>
    data.update({ id: 1, a: 1, b: 1 })
  ))

  // It means you can't update a document without providing an id.
  it('fails if document has no id provided', assertErrors(() =>
    data.update({ a: 1, b: 1 })
  ))

  // Calling `update` with `null` is an error.
  it('fails if null is passed', assertThrows(
    'The argument to update must be non-null',
    () => data.update(null)
  ))

  // Calling `update` with `undefined` is also an error.
  it('fails if undefined is passed', assertThrows(
    'The 1st argument to update must be defined',
    () => data.update(undefined)
  ))

  it('fails if no arguments are passed', assertThrows(
    'update must receive exactly 1 argument',
    () => data.update()
  ))

  // The `update` command allows storing multiple documents in one call.
  // Let's update a few documents and make sure we get them back.
  it('allows updating multiple documents in one call', assertCompletes(() =>
    data.store([
      { id: 1, a: { b: 1, c: 1 }, d: 1 },
      { id: 2, a: { b: 2, c: 2 }, d: 2 },
    ])::toArray()
      // should return an array with an ID of the inserted document.
      ::tap(res => assert.deepEqual([ 1, 2 ], res))
      // Let's make sure we get back the documents that we put in.
      ::mergeMapTo(data.findAll(1, 2).fetch())
      // Check that we get back what we put in.
      ::tap(res => assert.sameDeepMembers(res, [
        { id: 1, a: { b: 1, c: 1 }, d: 1 },
        { id: 2, a: { b: 2, c: 2 }, d: 2 }
      ]))
      // All right. Let's update the documents now
      ::mergeMapTo(data.update([ { id: 1, a: { c: 2 } }, { id: 2, d: 3 } ]))
      ::toArray()
      // We should have gotten the ID back again
      ::tap(res => assert.deepEqual(res, [ 1, 2 ]))
      // Make sure `update` updated the documents properly
      ::mergeMapTo(data.findAll(1, 2).fetch())
      // Check that we get back what we put in.
      ::tap(res => assert.sameDeepMembers(res, [
        { id: 1, a: { b: 1, c: 2 }, d: 1 },
        { id: 2, a: { b: 2, c: 2 }, d: 3 },
      ]))
  ))

  // If any operation in a batch update fails, everything is reported as a
  // failure. Note that we're updating `null` below, and a document with
  // no ID. Both are failures.
  it('fails if any document in a batch fails to update', assertErrors(() =>
    data.update([ { id: 1, a: 1 }, null, { a: 1 } ])
  ))

  // Updating an empty batch of documents is ok, and returns an empty
  // array.
  it('allows updating an empty batch', assertCompletes(() =>
    data.update([])
      ::tap(res => {
        // should return an array with the IDs of the documents in
        // order, including the generated IDS.
        assert.isArray(res)
        assert.lengthOf(res, 0)
      })
  ))
} // Testing `update`
