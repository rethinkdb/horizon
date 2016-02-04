'use strict'
const updateSuite = getData => () => {
  let data

  before(() => {
    data = getData()
  })

  // The `update` command updates documents already in the database. It
  // errors if the document doesn't exist.
  it('#.update(single_non_existent)', done => {
    data.update({ id: 1, a: 1, b: 1 })
      .subscribe(doneErrorObserver(done))
  })

  // It means you can't update a document without providing an id.
  it("#.update(single_non_id)", done => {
    data.update({ a: 1, b: 1 })
      .subscribe(doneErrorObserver(done))
  });

  // Let's store a document first, then update it.
  it("#.update(single_existing)", done => {
    data.store({ id: 1, a: { b: 1, c: 1 }, d: 1 }).toArray()
      // should return an array with an ID of the inserted document.
      .do(res => assert.deepEqual([ 1 ], res))
      // Let's make sure we get back the document that we put in.
      .flatMap(() => data.find(1).fetch())
      // Check that we get back what we put in.
      .do(res => assert.deepEqual(res, { id: 1, a: { b: 1, c: 1 }, d: 1 }))
      // Let's update the document now
      .flatMap(() => data.update({ id: 1, a: { c: 2 } })).toArray()
      // We should have gotten the ID back again
      .do((res) => assert.deepEqual([ 1 ], res))
      // Make sure `upsert` updated the original document
      .flatMap(() => data.find(1).fetch())
      // Check that the document was updated correctly
      .do(res => assert.deepEqual(res, { id: 1, a: { b: 1, c: 2 }, d: 1 }))
      .subscribe(doneObserver(done))
  })

  // Calling `update` with `null` is an error.
  it("#.update(null)", assertThrows(
    'The argument to update must be non-null',
    () => data.update(null)
  ))

  // Calling `update` with `undefined` is also an error.
  it("#.update(undefined)", assertThrows(
    'The 1st argument to update must be defined',
    () => data.update(undefined)
  ))

  it('fails if no arguments are passed', assertThrows(
    'update must receive exactly 1 argument',
    () => data.update()
  ))

  // The `update` command allows storing multiple documents in one call.
  // Let's update a few documents and make sure we get them back.
  it("#.update(multiple)", done => {
    data.store([
      { id: 1, a: { b: 1, c: 1 }, d: 1 },
      { id: 2, a: { b: 2, c: 2 }, d: 2 },
    ]).toArray()
      // should return an array with an ID of the inserted document.
      .do(res => assert.deepEqual([ 1, 2 ], res))
      // Let's make sure we get back the documents that we put in.
      .flatMap(() => data.findAll(1, 2).fetch({ asCursor: false }))
      // Check that we get back what we put in.
      .do(res => assert.sameDeepMembers(res, [
        { id: 1, a: { b: 1, c: 1 }, d: 1 },
        { id: 2, a: { b: 2, c: 2 }, d: 2 }
      ]))
      // All right. Let's update the documents now
      .flatMap(() => data.update([ { id: 1, a: { c: 2 } }, { id: 2, d: 3 } ]))
      .toArray()
      // We should have gotten the ID back again
      .do(res => assert.deepEqual(res, [ 1, 2 ]))
      // Make sure `update` updated the documents properly
      .flatMap(() => data.findAll(1, 2).fetch({ asCursor: false }))
      // Check that we get back what we put in.
      .do(res => assert.sameDeepMembers(res, [
        { id: 1, a: { b: 1, c: 2 }, d: 1 },
        { id: 2, a: { b: 2, c: 2 }, d: 3 },
      ]))
      .subscribe(doneObserver(done))
  })

  // If any operation in a batch update fails, everything is reported as a
  // failure. Note that we're updating `null` below, and a document with
  // no ID. Both are failures.
  it("#.update(multiple_one_null)", done => {
    data.update([ { id: 1, a: 1 }, null, { a: 1 } ])
      .subscribe(doneErrorObserver(done))
  })

  // Updating an empty batch of documents is ok, and returns an empty
  // array.
  it("#.update(empty_batch)", done => {
    data.update([])
      .do(res => {
        // should return an array with the IDs of the documents in
        // order, including the generated IDS.
        assert.isArray(res)
        assert.lengthOf(res, 0)
      })
      .subscribe(doneObserver(done))
  })
} // Testing `update`
