'use strict'
const findSuite = window.findSuite = getData => () => {
  let data

  before(() => {
    data = getData()
  })

  // Let's grab a specific document using `find`
  it('locates a single document when passed an id', assertCompletes(() =>
    data.find(1).fetch()
      .do(res => assert.deepEqual(res, { id: 1, a: 10 }))
  ))

  // This is equivalent to searching by field `id`
  it('locates a single document when passed an object with an id field',
     assertCompletes(() =>
       data.find({ id: 1 }).fetch()
         .do(res => assert.deepEqual(res, { id: 1, a: 10 }))
  ))

  // `find` returns `null` if a document doesn't exist.
  it(`returns nothing if an object doesn't exist`, assertCompletes(() =>
    data.find('abracadabra').fetch()
      .do(res => assert.fail('Should receive nothing'))
  ))

  // Looking for `null` is an error. RethinkDB doesn't allow secondary
  // index values to be `null`.
  it('throws an error if called with null', assertThrows(
    'The argument to find must be non-null',
    () => data.find(null).fetch()
  ))

  // Looking for `undefined` is also an error.
  it('throws an error if called with undefined', assertThrows(
    'The 1st argument to find must be defined',
    () => data.find(undefined).fetch()
  ))

  it('throws an error if no arguments are passed', assertThrows(
    'find must receive exactly 1 argument',
    () => data.find().fetch()
  ))

  // The document passed to `find` can't be empty
  it('errors if the document passed is empty', assertErrors(() =>
    data.find({}).fetch()
  ))

  // We can also `find` by a different (indexed!) field. In that case,
  // `find` will return the first match.
  it('locates documents by other fields if passed an object',
     assertCompletes(() =>
       data.find({ a: 10 }).fetch()
         .do(res => assert.deepEqual(res, { id: 1, a: 10 }))
  ))

  // Let's try this again for a value that doesn't exist.
  it('returns nothing if a document with the given value doesnt exist',
     assertCompletes(() => data.find({ a: 100 })
                     .fetch()
                     .do(res => assert.fail())
  ))

  // Let's try this again for a field that doesn't exist.
  it('returns nothing if no object with the given field exists',
     assertCompletes(() => data
                     .find({ field: 'a' })
                     .fetch()
                     .do(() => assert.fail())
  ))

  // Let's try this again, now with multiple results.
  it('returns one result even if several documents match', assertCompletes(() =>
    data.find({ a: 20 }).fetch().toArray()
      // The id should be one of 2, 3, or 4
      .do(res => {
        assert.include([ 2, 3, 4 ], res[0].id)
        assert.equal(res.length, 1)
      })
  ))

  // Users can pass multiple fields to look for
  it('can find documents when constrained by multiple field values', assertCompletes(() =>
    data.find({ a: 20, b: 1 }).fetch()
      .do(res => assert.deepEqual(res, { id: 2, a: 20, b: 1 }))
  ))

  // In this case there is no matching document
  it(`wont return anything if documents dont match`, assertCompletes(() =>
    data.find({ a: 20, c: 100 }).fetch()
      .do(() => assert.fail())
  ))

  // Passing multiple arguments to find should return a nice error
  it('throws an error if multiple arguments are passed', assertThrows(
    'find must receive exactly 1 argument',
    () => data.find(1, { id: 1 }).fetch()
  ))
} // Testing `find`
