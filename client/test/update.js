import 'rxjs/add/operator/do'
import 'rxjs/add/operator/mergeMapTo'
import 'rxjs/add/operator/toArray'

import { assertCompletes,
         assertThrows,
         assertErrors,
         compareWithoutVersion,
         compareSetsWithoutVersion } from './utils'

const updateSuite = global.updateSuite = getData => () => {
  let data

  before(() => {
    data = getData()
  })

  // Let's store a document first, then update it.
  it('allows updating an existing document', assertCompletes(() =>
    data.store({ id: 1, a: { b: 1, c: 1 }, d: 1 }).toArray()
      // should return an array with an ID of the inserted document.
      .do(res => compareWithoutVersion([ { id: 1 } ], res))
      // Let's make sure we get back the document that we put in.
      .mergeMapTo(data.find(1).fetch())
      // Check that we get back what we put in.
      .do(res => compareWithoutVersion(res, { id: 1, a: { b: 1, c: 1 }, d: 1 }))
      // Let's update the document now
      .mergeMapTo(data.update({ id: 1, a: { c: 2 } })).toArray()
      // We should have gotten the ID back again
      .do((res) => compareWithoutVersion([ { id: 1 } ], res))
      // Make sure `upsert` updated the original document
      .mergeMapTo(data.find(1).fetch())
      // Check that the document was updated correctly
      .do(res => compareWithoutVersion(res, { id: 1, a: { b: 1, c: 2 }, d: 1 }))
  ))

  // The `update` command updates documents already in the database. It
  // errors if the document doesn't exist.
  it(`fails if document doesn't exist`, assertErrors(() =>
    data.update({ id: 1, a: 1, b: 1 }),
    /The document was missing/
  ))

  // It means you can't update a document without providing an id.
  it('fails if document has no id provided', assertErrors(() =>
    data.update({ a: 1, b: 1 }),
    /"id" is required/
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
    ]).toArray()
      // should return an array with an ID of the inserted document.
      .do(res => compareWithoutVersion([ { id: 1 }, { id: 2 } ], res))
      // Let's make sure we get back the documents that we put in.
      .mergeMapTo(data.findAll(1, 2).fetch())
      // Check that we get back what we put in.
      .do(res => compareSetsWithoutVersion(res, [
        { id: 1, a: { b: 1, c: 1 }, d: 1 },
        { id: 2, a: { b: 2, c: 2 }, d: 2 },
      ]))
      // All right. Let's update the documents now
      .mergeMapTo(data.update([ { id: 1, a: { c: 2 } }, { id: 2, d: 3 } ]))
      .toArray()
      // We should have gotten the ID back again
      .do(res => compareWithoutVersion(res, [ { id: 1 }, { id: 2 } ]))
      // Make sure `update` updated the documents properly
      .mergeMapTo(data.findAll(1, 2).fetch())
      // Check that we get back what we put in.
      .do(res => compareSetsWithoutVersion(res, [
        { id: 1, a: { b: 1, c: 2 }, d: 1 },
        { id: 2, a: { b: 2, c: 2 }, d: 3 },
      ]))
  ))

  it('fails if any document is null', assertErrors(() =>
    data.update([ { id: 1, a: 1 }, null ]),
    /must be an object/
  ))

  // Updating an empty batch of documents is ok, and returns an empty
  // array.
  it('allows updating an empty batch', assertCompletes(() =>
    data.update([])
      .do(res => {
        // should return an array with the IDs of the documents in
        // order, including the generated IDS.
        assert.isArray(res)
        assert.lengthOf(res, 0)
      })
  ))
} // Testing `update`
