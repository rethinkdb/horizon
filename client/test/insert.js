import 'rxjs/add/operator/do'
import 'rxjs/add/operator/mergeMapTo'
import 'rxjs/add/operator/mergeMap'
import 'rxjs/add/operator/toArray'

import {assertCompletes,
        assertThrows,
        assertErrors,
        compareWithoutVersion,
        compareSetsWithoutVersion} from './utils'

export default function insertSuite(getData) {
  return () => {
  let data

  before(() => {
    data = getData()
  })

  // The `insert` command stores documents in the database, and errors if
  // the documents already exist.
  it('stores documents in db, errors if documents already exist', assertErrors(() =>
    data.insert({id: 1, a: 1, b: 1}).toArray()
      // Should return an array with an ID of the inserted
      // document.
      .do(res => compareWithoutVersion([{id: 1}], res))
      // Let's make sure we get back the document that we put in.
      .mergeMapTo(data.find(1).fetch())
      // Check that we get back what we put in.
      .do(res => compareWithoutVersion({id: 1, a: 1, b: 1}, res))
      // Let's attempt to overwrite the document now. This should error.
      .mergeMapTo(data.insert({id: 1, c: 1})),
      /The document already exists/
  ))

  // If we insert a document without an ID, the ID is generated for us.
  // Let's run the same test as above (insert the document and then
  // attempt to overwrite it), but have the ID be generated for us.
  it(`generates ids if documents don't already have one`, assertErrors(() => {
    let new_id

    return data.insert({a: 1, b: 1}).toArray()
      // should return an array with an ID of the inserted document.
      .do(res => {
        assert.isArray(res)
        assert.lengthOf(res, 1)
        assert.isString(res[0].id)
        new_id = res[0].id
      })
      // Let's make sure we get back the document that we put in.
      .mergeMap(() => data.find(new_id).fetch())
      // Check that we get back what we put in.
      .do(res => compareWithoutVersion({id: new_id, a: 1, b: 1}, res))
      // Let's attempt to overwrite the document now
      .mergeMap(() => data.insert({id: new_id, c: 1}))
    }, /The document already exists/
  ))

  it('fails if null is passed', assertErrors(
    () => data.insert(null),
    /Row to be written must be an object./
  ))

  it('fails if undefined is passed', assertErrors(
    () => data.insert(undefined),
    /Row to be written must be an object./
  ))

  it('fails if given no argument', assertErrors(
    () => data.insert(),
    /Writes must be given a single object or an array of objects./
  ))

  // The `insert` command allows storing multiple documents in one call.
  // Let's insert a few kinds of documents and make sure we get them back.
  it('can store multiple documents in one call', assertCompletes(() => {
    let new_id_0, new_id_1

    return data.insert([
        {},
        {a: 1},
        {id: 1, a: 1},
    ]).toArray()
      .do(res => {
        // should return an array with the IDs of the documents in
        // order, including the generated IDS.
        assert.isArray(res)
        assert.lengthOf(res, 3)
        assert.isString(res[0].id)
        assert.isString(res[1].id)
        assert.equal(1, res[2].id)

        new_id_0 = res[0].id
        new_id_1 = res[1].id
      })
      // Make sure we get what we put in.
      .mergeMap(() =>
               data.findAll(new_id_0, new_id_1, 1).fetch())
      // We're supposed to get an array of documents we put in
      .do(res => compareSetsWithoutVersion(res, [
        {id: new_id_0},
        {id: new_id_1, a: 1},
        {id: 1, a: 1},
      ]))
  }))

  // If any operation in a batch insert fails, everything is reported as a
  // failure.
  it('gets an Error object if an operation in a batch fails', assertCompletes(() =>
    // Lets insert a document that will trigger a duplicate error when we
    // attempt to reinsert it
    data.insert({id: 2, a: 2})
      // should return an array with an ID of the inserted document.
      .do(res => compareWithoutVersion(res, {id: 2}))
      // Let's make sure we get back the document that we put in.
      .mergeMap(() => data.find(2).fetch())
      // Check that we get back what we put in.
      .do(res => compareWithoutVersion(res, {id: 2, a: 2}))
      // One of the documents in the batch already exists
      .mergeMap(() => data.insert([
        {id: 1, a: 1},
        {id: 2, a: 2},
        {id: 3, a: 3},
      ]))
      .toArray()
      .do(res => compareWithoutVersion(res, [
        {id: 1},
        {error: 'The document already exists.'},
        {id: 3},
      ]))
  ))

  // Let's trigger a failure in an insert batch again, this time by making
  // one of the documents `null`.
  it('works if any member of batch is null', assertCompletes(() =>
    data.insert([{id: 0, a: 1}, null, {id: 1, a: 1}]).toArray()
      .do(res => compareWithoutVersion(res, [
        {id: 0},
        {error: 'Row to be written must be an object.'},
        {id: 1},
      ]))
  ))

  // Inserting an empty batch of documents is ok, and returns an empty
  // array.
  it('can store empty batches', assertCompletes(() =>
    data.insert([])
      .do(res => {
        // should return an array with the IDs of the documents
        // in order, including the generated IDS.
        assert.isArray(res)
        assert.lengthOf(res, 0)
      })
  ))
}}
