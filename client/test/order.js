'use strict'
const orderSuite = (getData, getTestData) => () => {
  let data, testData

  before(() => {
    data = getData()
    testData = getTestData()
  })

  // We can order by a field (default order is ascending)
  it('orders results by a field', assertCompletes(() =>
    data.order('id').fetch({ asCursor: false })
      .do(res => assert.deepEqual(res, testData))
  ))

  // That's the same as passing `ascending` explicitly
  it('orders results ascending implicitly', assertCompletes(() =>
    data.order('id', 'ascending').fetch({ asCursor: false })
      .do(res => assert.deepEqual(res, testData))
  ))

  // We can also sort in descending order
  it('can order results in descending order', assertCompletes(() =>
    data.order('id', 'descending').fetch({ asCursor: false })
      .do(res => assert.deepEqual(res, _.cloneDeep(testData).reverse()))
  ))

  // Let's try ordering by a different field.
  it('can order results by a field other than id', assertCompletes(() =>
    data.order('b').fetch({ asCursor: false })
      .do(res => assert.deepEqual(res.slice(3), [
        { id: 2, a: 20, b: 1 },
        { id: 3, a: 20, b: 2 },
        { id: 4, a: 20, b: 3 },
      ]))
  ))

  // Let's try ordering by a different field descneding.
  it('can order results by another field in descending order', assertCompletes(() =>
    data.order('b', 'descending').fetch({ asCursor: false })
      .do(res => assert.deepEqual(res.slice(0, 3), [
        { id: 4, a: 20, b: 3 },
        { id: 3, a: 20, b: 2 },
        { id: 2, a: 20, b: 1 },
      ]))
  ))

  // Let's try to order by a missing field
  it('returns in arbitrary order if a bad field is given', assertCompletes(() =>
    data.order('abracadabra').fetch({ asCursor: false })
      .do(res => assert.sameDeepMembers(res, testData))
  ))

  // We can pass multiple fields to `order` to disambiguate.
  it('can order by multiple fields', assertCompletes(() =>
    data.order(['a', 'id']).fetch({ asCursor: false })
      .do(res => assert.deepEqual(res, _.sortByAll(testData, [ 'a', 'id' ])))
  ))

  // We can pass multiple fields to `order` to disambiguate. Let's do it in
  // descending order.
  it('can order by multiple fields descending', assertCompletes(() =>
    data.order(['a', 'id'], 'descending').fetch({ asCursor: false })
      .do(res => assert.deepEqual(res, _.sortByAll(testData, ['a', 'id']).reverse()))
  ))

  // `order` cannot accept any keys that are present in `findAll`
  it('cannot accept any keys that are present in findAll', assertErrors(() =>
    data.findAll({id: 1}).order('id').fetch()
  ))

  it(`errors if the 2nd argument isn't 'ascending' or 'descending'`,
     assertErrors(() => data.order('id', 'foo').fetch()
  ))

  // Passing no arguments, null, bad arguments, or too many arguments is
  // an error.
  it('throws if it receives no arguments', assertThrows(
    'order must receive at least 1 argument.',
    () => data.order().fetch()
  ))
  it('throws if it receives a null argument', assertThrows(
    'The 1st argument to order must be non-null',
    () => data.order(null).fetch()
  ))
  it('throws if its first argument is null', assertThrows(
    'The 1st argument to order must be non-null',
    () => data.order(null, 'foo').fetch()
  ))
  it('throws if it receives more than 2 arguments', assertThrows(
    'order accepts at most 2 arguments.',
    () => data.order('id', 'ascending', 1).fetch()
  ))
} // Testing `order`
