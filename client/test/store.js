import 'rxjs/add/operator/do'
import 'rxjs/add/operator/mergeMapTo'
import 'rxjs/add/operator/mergeMap'
import 'rxjs/add/operator/toArray'

import {assertCompletes,
        assertThrows,
        assertErrors,
        compareWithoutVersion,
        compareSetsWithoutVersion} from './utils'

export default function storeSuite(getData) {
  return () => {
  let data

  before(() => {
    data = getData()
  })

  // The `store` command stores documents in the database, and overwrites
  // them if they already exist.
  it('creates or replaces a document', assertCompletes(() =>
      data.store({id: 1, a: 1, b: 1})
      // The promise should return an array with an ID of the inserted
      // document.
      .do(res => compareWithoutVersion(res, {id: 1}))
      // Let's make sure we get back the document that we put in.
      .mergeMapTo(data.find(1).fetch())
      // Check that we get back what we put in.
      .do(res => compareWithoutVersion(res, {id: 1, a: 1, b: 1}))
      // Let's overwrite the document now
      .mergeMapTo(data.store({id: 1, c: 1}))
      // We should have gotten the ID back again
      .do(res => compareWithoutVersion(res, {id: 1}))
      // Make sure `store` overwrote the original document
      .mergeMapTo(data.find(1).fetch())
      // Check that we get back what we put in.
      .do(res => compareWithoutVersion(res, {id: 1, c: 1}))
  ))

  // If we store a document without an ID, the ID is generated for us.
  // Let's run the same test as above (store the document and then
  // overwrite it), but have the ID be generated for us.
  it('generates ids for documents without them', assertCompletes(() => {
    let new_id

    return data.store({a: 1, b: 1}).toArray()
      .do(res => {
        // The promise should return an array with an ID of the
        // inserted document.
        assert.lengthOf(res, 1)
        assert.isObject(res[0])
        assert.isString(res[0].id)
        new_id = res[0].id
      })
      // Let's make sure we get back the document that we put in.
      .mergeMap(() => data.find(new_id).fetch())
      // Check that we get back what we put in.
      .do(res => compareWithoutVersion({id: new_id, a: 1, b: 1}, res))
      // Let's overwrite the document now
      .mergeMap(() => data.store({id: new_id, c: 1}))
      // We should have gotten the ID back again
      .do(res => assert.deepEqual(new_id, res.id))
      // Make sure `store` overwrote the original document
      .mergeMap(() => data.find(new_id).fetch())
      // Check that we get back what we put in.
      .do(res => compareWithoutVersion({id: new_id, c: 1}, res))
  }))

  // Storing `null` is an error.
  it('fails if null is passed', assertErrors(
    () => data.store(null),
    /Row to be written must be an object./
  ))

  // Storing `undefined` is also an error.
  it('fails if undefined is passed', assertErrors(
    () => data.store(undefined),
    /Row to be written must be an object./
  ))

  // Storing nothing is an error
  it('fails if no arguments are passed', assertErrors(
    () => data.store(),
    /Writes must be given a single object or an array of objects./
  ))

  // The `store` command allows storing multiple documents in one call.
  // Let's store a few kinds of documents and make sure we get them back.
  it('allows storing multiple documents in one call', assertCompletes(() => {
    let new_id_0, new_id_1

    return data.store([{}, {a: 1}, {id: 1, a: 1}])
      .toArray()
      .do(res => {
        // The promise should return an array with the IDs of the documents
        // in order, including the generated IDS.
        assert.isArray(res)
        assert.lengthOf(res, 3)
        assert.isString(res[0].id)
        assert.isString(res[1].id)
        assert.equal(1, res[2].id)

        new_id_0 = res[0].id
        new_id_1 = res[1].id
      })
      // Make sure we get what we put in.
      .mergeMap(() => data.findAll(new_id_0, new_id_1, 1)
               .fetch())
      // We're supposed to get an array of documents we put in
      .do(res => compareSetsWithoutVersion(res, [
        {id: new_id_0},
        {id: new_id_1, a: 1},
        {id: 1, a: 1},
      ]))
  }))

  it('works if any operation in a batch fails', assertCompletes(() =>
    data.store([{id: 0, a: 1}, null, {id: 1, a: 1}]).toArray()
      .do(res => compareWithoutVersion(res, [
          {id: 0},
          {error: 'Row to be written must be an object.'},
          {id: 1},
        ]))
  ))

  // Storing an empty batch of documents is ok, and returns an empty
  // array.
  it('allows storing empty batches', assertCompletes(() =>
    data.store([]).toArray()
      .do(res => {
        // The promise should return an array with the IDs of the documents
        // in order, including the generated IDS.
        assert.isArray(res)
        assert.lengthOf(res, 0)
      })
  ))

  it('stores date objects and retrieves them again', assertCompletes(() => {
    const originalDate = new Date()
    return data.store({date: originalDate}).toArray()
      .mergeMap(res => data.find(res[0]).fetch())
      .do(result => assert.deepEqual(originalDate, result.date))
  }))
}}
