'use strict'
const upsertSuite = window.upsertSuite = getData => () => {
  let data

  before(() => {
    data = getData()
  })

  // The `upsert` command stores documents in the database, and updates
  // them if they already exist.
  it(`updates existing documents or creates them if they don't exist`,
     assertCompletes(() =>
    data.upsert({ id: 1, a: { b: 1, c: 1 }, d: 1 }).toArray()
      // should return an array with an ID of the inserted document.
      .do(res => assert.deepEqual(res, [ 1 ]))
      // Let's make sure we get back the document that we put in.
      .flatMap(data.find(1).fetch())
      // Check that we get back what we put in.
      .do(res => assert.deepEqual(res, { id: 1, a: { b: 1, c: 1 }, d: 1 }))
      // Let's update the document now
      .flatMap(data.upsert({ id: 1, a: { c: 2 } })).toArray()
      // We should have gotten the ID back again
      .do(res => assert.deepEqual([ 1 ], res))
      // Make sure `upsert` updated the original document
      .flatMap(data.find(1).fetch())
      // Check that the document was updated correctly
      .do(res => assert.deepEqual(res, { id: 1, a: { b: 1, c: 2 }, d: 1 }))
  ))

  // If we upsert a document without an ID, the ID is generated for us.
  // Let's run the same test as above (store the document and then update
  // it), but have the ID be generated for us.
  it('generates ids for documents without them', assertCompletes(() => {
    let new_id

    return data.upsert({ a: { b: 1, c: 1 }, d: 1 }).toArray()
      .do(res => {
        // should return an array with an ID of the inserted document.
        assert.isArray(res)
        assert.lengthOf(res, 1)
        assert.isString(res[0])
        new_id = res[0]
      })
      // Let's make sure we get back the document that we put in.
      .flatMap(() => data.find(new_id).fetch())
      // Check that we get back what we put in.
      .do(res => assert.deepEqual(res, { id: new_id, a: { b: 1, c: 1 }, d: 1 }))
      // Let's update the document now
      .flatMap(() => data.upsert({ id: new_id, a: { c: 2 } })).toArray()
      // We should have gotten the ID back again
      .do(res => assert.deepEqual(res, [ new_id ]))
      // Make sure `upsert` updated the original document
      .flatMap(() => data.find(new_id).fetch())
      // Check that we get back what we put in.
      .do(res => assert.deepEqual(res, { id: new_id, a: { b: 1, c: 2 }, d: 1 }))
  }))

  // Upserting `null` is an error.
  it('fails if null is passed', assertThrows(
    'The argument to upsert must be non-null',
    () => data.upsert(null)
  ))

  // Upserting `undefined` is also an error.
  it('fails if undefined is passed', assertThrows(
    'The 1st argument to upsert must be defined',
    () => data.upsert(undefined)
  ))

  it('fails if no arguments are passed', assertThrows(
    'upsert must receive exactly 1 argument',
    () => data.upsert()
  ))

  // The `upsert` command allows storing multiple documents in one call.
  // Let's upsert a few kinds of documents and make sure we get them back.
  it('allows upserting multiple documents in one call', assertCompletes(() => {
    let new_id_0, new_id_1

    return data.upsert([ {}, { a: 1 }, { id: 1, a: 1 } ]).toArray()
      .do(res => {
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
      .flatMap(() => data.findAll(new_id_0, new_id_1, 1).fetch({ asCursor: false }))
      // We're supposed to get an array of documents we put in
      .do(res => assert.sameDeepMembers(res, [
        { id: new_id_0 },
        { id: new_id_1, a: 1 },
        { id: 1, a: 1 },
      ]))
  }))

  // If any operation in a batch upsert fails, everything is reported
  // as a failure.
  it('fails if any document in the batch fails ', assertErrors(() =>
    data.upsert([ { a: 1 }, null, { id: 1, a: 1 } ])
  ))

  // Upserting an empty batch of documents is ok, and returns an empty
  // array.
  it('allows upserting an empty batch', assertCompletes(() =>
    data.upsert([]).toArray()
      .do(res => {
        // should return an array with the IDs of the documents in
        // order, including the generated IDS.
        assert.lengthOf(res, 0)
      })
  ))
} // Testing `upsert`
