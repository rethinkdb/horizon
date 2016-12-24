import 'rxjs/add/operator/do'
import 'rxjs/add/operator/toArray'

import {assertCompletes,
        assertThrows,
        assertErrors,
        compareWithoutVersion} from './utils'

export default function findSuite(getData) {
  return () => {
  let data

  before(() => {
    data = getData()
  })

  // Let's grab a specific document using `find`
  it('locates a single document when passed an id', assertCompletes(() =>
    data.find(1).fetch()
      .do(res => compareWithoutVersion(res, {id: 1, a: 10}))
  ))

  // This is equivalent to searching by field `id`
  it('locates a single document when passed an object with an id field',
     assertCompletes(() =>
       data.find({id: 1}).fetch()
         .do(res => compareWithoutVersion(res, {id: 1, a: 10}))
  ))

  // `find` returns `null` if a document doesn't exist.
  it(`returns null if an object doesn't exist`, assertCompletes(() =>
    data.find('abracadabra').fetch()
      .do(res => assert.equal(res, null))
  ))

  // Looking for `null` is an error. RethinkDB doesn't allow secondary
  // index values to be `null`.
  it('throws an error if called with null', assertErrors(
    () => data.find(null).fetch(),
    /"find" argument is not an object or valid index value./
  ))

  // Looking for `undefined` is also an error.
  it('throws an error if called with undefined', assertErrors(
    () => data.find(undefined).fetch(),
    /"find" argument is not an object or valid index value./
  ))

  it('throws an error if no arguments are passed', assertErrors(
    () => data.find().fetch(),
    /"find" expected 1 argument but found 0./
  ))

  // The document passed to `find` can't be empty
  it('errors if the document passed is empty', assertErrors(() =>
    data.find({}).fetch(),
    /"find" object must have at least 1 field./
  ))

  // We can also `find` by a different (indexed!) field. In that case,
  // `find` will return the first match.
  it('locates documents by other fields if passed an object',
     assertCompletes(() =>
       data.find({a: 10}).fetch()
         .do(res => compareWithoutVersion(res, {id: 1, a: 10}))
  ))

  // Let's try this again for a value that doesn't exist.
  it('returns null if a document with the given value doesnt exist',
     assertCompletes(() => data.find({a: 100}).fetch()
                     .do(res => assert.equal(res, null))
  ))

  // Let's try this again for a field that doesn't exist.
  it('returns null if no object with the given field exists',
     assertCompletes(() => data.find({field: 'a'}).fetch()
                     .do(res => assert.equal(res, null))
  ))

  // Let's try this again, now with multiple results.
  it('returns one result even if several documents match', assertCompletes(() =>
    data.find({a: 20}).fetch()
      // The id should be one of 2, 3, or 4
      .do(res => {
        assert.include([2, 3, 4], res.id)
      })
  ))

  // Users can pass multiple fields to look for
  it('can find documents when constrained by multiple field values', assertCompletes(() =>
    data.find({a: 20, b: 1}).fetch()
      .do(res => compareWithoutVersion(res, {id: 2, a: 20, b: 1}))
  ))

  // In this case there is no matching document
  it('wont return anything if documents dont match', assertCompletes(() =>
    data.find({a: 20, c: 100}).fetch()
      .do(res => assert.equal(res, null))
  ))

  // Passing multiple arguments to find should return a nice error
  it('throws an error if multiple arguments are passed', assertErrors(
    () => data.find(1, {id: 1}).fetch(),
    /"find" expected 1 argument but found 2./
  ))


  it('emits null when the document id is not found', done => {
    let gotResult = false
    return data.find('does_not_exist').fetch().subscribe({
      next(result) {
        gotResult = true
        assert.deepEqual(result, null)
      },
      error(err) {
        done(err)
      },
      complete() {
        if (!gotResult) {
          done(new Error('never received result'))
        } else {
          done()
        }
      },
    })
  })
}}
