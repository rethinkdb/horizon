'use strict'
const storeSuite = getData => () => {
  let data

  before(() => {
    data = getData()
  })

  // The `store` command stores documents in the database, and overwrites
  // them if they already exist.
  it('will create or update a document', done => {
    data.store({ id: 1, a: 1, b: 1 })
      // The promise should return an array with an ID of the inserted
      // document.
      .do(res => assert.deepEqual(res, 1))
      // Let's make sure we get back the document that we put in.
      .flatMap(() => data.find(1).fetch())
      // Check that we get back what we put in.
      .do(res => assert.deepEqual(res, { id: 1, a: 1, b: 1 }))
      // Let's overwrite the document now
      .flatMap(() => data.store({ id: 1, c: 1 }))
      // We should have gotten the ID back again
      .do(res => assert.deepEqual(res, 1))
      // Make sure `store` overwrote the original document
      .flatMap(() => data.find(1).fetch())
      // Check that we get back what we put in.
      .do(res => assert.deepEqual(res, { id: 1, c: 1 }))
      .subscribe(doneObserver(done))
  })

  // If we store a document without an ID, the ID is generated for us.
  // Let's run the same test as above (store the document and then
  // overwrite it), but have the ID be generated for us.
  it('will generate an id for documents without one', done => {
    let new_id

    data.store({ a: 1, b: 1 }).toArray()
      .do(res => {
        // The promise should return an array with an ID of the
        // inserted document.
        assert.lengthOf(res, 1)
        assert.isString(res[0])
        new_id = res[0]
      })
      // Let's make sure we get back the document that we put in.
      .flatMap(() => data.find(new_id).fetch())
      // Check that we get back what we put in.
      .do(res => assert.deepEqual({ id: new_id, a: 1, b: 1 }, res))
      // Let's overwrite the document now
      .flatMap(() => data.store({ id: new_id, c: 1 }))
      // We should have gotten the ID back again
      .do(res => assert.deepEqual(new_id, res))
      // Make sure `store` overwrote the original document
      .flatMap(() => data.find(new_id).fetch())
      // Check that we get back what we put in.
      .do(res => assert.deepEqual({ id: new_id, c: 1 }, res))
      .subscribe(doneObserver(done))
  })

  // Storing `null` is an error.
  it('fails if null is passed', assertThrows(
    'The argument to store must be non-null',
    () => data.store(null))
  )

  // Storing `undefined` is also an error.
  it('fails if undefined is passed', assertThrows(
    'The 1st argument to store must be defined',
    () => data.store(undefined)
  ))

  // Storing nothing is an error
  it('fails if no arguments are passed', assertThrows(
    'store must receive exactly 1 argument',
    () => data.store()
  ))

  // The `store` command allows storing multiple documents in one call.
  // Let's store a few kinds of documents and make sure we get them back.
  it('can store multiple documents in one call', done => {
    let new_id_0, new_id_1

    data.store([ {}, { a: 1 }, { id: 1, a: 1 } ])
      .toArray()
      .do(res => {
        // The promise should return an array with the IDs of the documents
        // in order, including the generated IDS.
        assert.isArray(res)
        assert.lengthOf(res, 3)
        assert.isString(res[0])
        assert.isString(res[1])
        assert.equal(1, res[2])

        new_id_0 = res[0]
        new_id_1 = res[1]
      })
      // Make sure we get what we put in.
      .flatMap(() =>
               data.findAll(new_id_0, new_id_1, 1).fetch({ asCursor: false }))
      // We're supposed to get an array of documents we put in
      .do(res => assert.sameDeepMembers([
        { id: new_id_0 },
        { id: new_id_1, a: 1 },
        { id: 1, a: 1 },
      ], res))
      .subscribe(doneObserver(done))
  })

  // If any operation in a batch store fails, everything is reported as a
  // failure. Note that we're storing `null` below, which is a failure.
  it('fails if any operation in a batch fails', done => {
    data.store([ { a: 1 }, null, { id: 1, a: 1 } ])
      .subscribe(doneErrorObserver(done))
  })

  // Storing an empty batch of documents is ok, and returns an empty
  // array.
  it('can store an empty batch', done => {
    data.store([]).toArray()
      .do(res => {
        // The promise should return an array with the IDs of the documents
        // in order, including the generated IDS.
        assert.isArray(res)
        assert.lengthOf(res, 0)
      })
      .subscribe(doneObserver(done))
  })

  it('can store date objects and retrieve them again', done => {
    let originalDate = new Date()
    data.store({ date: originalDate }).toArray()
      .flatMap(id => data.find(id[0]).fetch())
      .do(result => assert.deepEqual(originalDate, result.date))
      .subscribe(doneObserver(done))
  })
} // Testing `store`
