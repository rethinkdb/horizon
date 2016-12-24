import 'rxjs/add/operator/do'
import 'rxjs/add/operator/mergeMapTo'
import 'rxjs/add/operator/toArray'

import {assertCompletes,
        assertThrows,
        assertErrors,
        compareWithoutVersion,
        compareSetsWithoutVersion} from './utils'

export default function replaceSuite(getData) {
  return () => {
  let data

  before(() => {
    data = getData()
  })

  // Let's store a document first, then replace it.
  it('replaces an existing document completely', assertCompletes(() =>
    data.store({id: 1, a: {b: 1, c: 1}, d: 1}).toArray()
      // should return an array with an ID of the inserted document.
      .do(res => compareWithoutVersion(res, [{id: 1}]))
      // Let's make sure we get back the document that we put in.
      .mergeMapTo(data.find(1).fetch())
      // Check that we get back what we put in.
      .do(res => compareWithoutVersion(res, {id: 1, a: {b: 1, c: 1}, d: 1}))
      // Let's replace the document now
      .mergeMapTo(data.replace({id: 1, a: {c: 2}})).toArray()
      // We should have gotten the ID back again
      .do(res => compareWithoutVersion(res, [{id: 1}]))
      // Make sure `replace` replaced the original document
      .mergeMapTo(data.find(1).fetch())
      // Check that the document was updated correctly
      .do(res => compareWithoutVersion(res, {id: 1, a: {c: 2}}))
  ))

  // The `replace` command replaces documents already in the database. It
  // errors if the document doesn't exist.
  it('fails if the document does not already exist', assertErrors(() =>
    data.replace({id: 1, a: 1, b: 1}),
    /document was missing/
  ))

  // It means you can't replace a document without providing an id.
  it('fails if document does not have an id', assertErrors(() =>
    data.replace({a: 1, b: 1}),
    /No attribute `id` in object/
  ))

  // Calling `replace` with `null` is an error.
  it('fails if null is passed', assertErrors(
    () => data.replace(null),
    /Row to be written must be an object./
  ))

  // Calling `replace` with `undefined` is also an error.
  it('fails if undefined is passed', assertErrors(
    () => data.replace(undefined),
    /Row to be written must be an object./
  ))

  it('fails if passed no arguments', assertErrors(
    () => data.replace(),
    /Writes must be given a single object or an array of objects./
  ))

  // The `replace` command allows storing multiple documents in one call.
  // Let's replace a few documents and make sure we get them back.
  it('allows replacing multiple documents with one call', assertCompletes(() =>
    data.store([
      {id: 1, a: {b: 1, c: 1}, d: 1},
      {id: 2, a: {b: 2, c: 2}, d: 2},
    ]).toArray()
      // should return an array with an ID of the inserted document.
      .do(res => compareWithoutVersion(res, [{id: 1}, {id: 2}]))
      // Let's make sure we get back the documents that we put in.
      .mergeMapTo(data.findAll(1, 2).fetch())
      // Check that we get back what we put in.
      .do(res => compareSetsWithoutVersion(res, [
        {id: 1, a: {b: 1, c: 1}, d: 1},
        {id: 2, a: {b: 2, c: 2}, d: 2},
      ]))
      // All right. Let's update the documents now
      .mergeMapTo(data.replace([
        {id: 1, a: {c: 2}},
        {id: 2, d: 3},
      ]))
      .toArray()
      // We should have gotten the ID back again
      .do(res => compareWithoutVersion(res, [{id: 1}, {id: 2}]))
      // Make sure `update` updated the documents properly
      .mergeMapTo(data.findAll(1, 2).fetch())
      // Check that we get back what we put in.
      .do(res => compareSetsWithoutVersion(res, [
        {id: 1, a: {c: 2}},
        {id: 2, d: 3},
      ]))
  ))

  it('fails if any document in a batch is null', assertCompletes(() =>
    data.replace([{id: 1, a: 1}, null]).toArray()
      .do(res => compareWithoutVersion(res, [
        {error: 'The document was missing.'},
        {error: 'Row to be written must be an object.'},
      ]))
  ))

  // Replacing an empty batch of documents is ok, and returns an empty
  // array.
  it('allows an empty batch of documents', assertCompletes(() =>
    data.replace([])
      .do(res => {
        // should return an array with the IDs of the documents in
        // order, including the generated IDS.
        assert.isArray(res)
        assert.lengthOf(res, 0)
      })
  ))
}}
