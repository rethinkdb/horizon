import { _do as tap } from 'rxjs/operator/do'
import { toArray } from 'rxjs/operator/toArray'

import { assertCompletes, assertThrows, assertErrors } from './utils'

const limitSuite = global.limitSuite = getData => () => {
  let data

  before(() => {
    data = getData()
  })

  // Limit returns an array of documents
  it('can return an array of documents', assertCompletes(() =>
    data.order('id').limit(2).fetch()
      ::tap(res => assert.deepEqual(res, [
        { id: 1, a: 10 },
        { id: 2, a: 20, b: 1 },
      ]))
  ))

  // We can chain `limit` off a collection
  it('can be called on a collection directly', assertCompletes(() =>
    data.limit(2).fetch()
      ::tap(res => {
        assert.isArray(res)
        assert.lengthOf(res, 2)
      })
  ))

  // Or off other things
  it('can be called on findAll', assertCompletes(() =>
    data.findAll({ a: 20 }).limit(2).fetch()
      ::tap(res => {
        assert.isArray(res)
        assert.lengthOf(res, 2)
      })
  ))

  // `limit(0)` is ok
  it('can accept an argument of 0', assertCompletes(() =>
    data.limit(0).fetch()
      ::tap(res => assert.deepEqual(res, []))
  ))

  // `limit(null)` is an error
  it('throws if it receives null', assertThrows(
    'The argument to limit must be non-null',
    () => data.limit(null).fetch()
  ))

  // `limit(-1)` is an error
  it('errors if it receives a negative argument', assertErrors(() =>
    data.limit(-1).fetch()
  ))

  // `limit(non_int)` is an error
  it(`errors if the argument to limit isn't a number`, assertErrors(() =>
    data.limit('k').fetch()
  ))

  // Chaining off of limit is illegal
  it('throws if findAll is called on it', assertThrows(
    'findAll cannot be called on the current query',
    () => data.limit(1).findAll({ id: 1 }).fetch()
  ))
  it('throws if below is called on it', assertThrows(
    'below cannot be called on the current query',
    () => data.limit(1).below({ id: 1 }).fetch()
  ))
  it('throws if above is called on it', assertThrows(
    'above cannot be called on the current query',
    () => data.limit(1).above({ id: 1 }).fetch()
  ))
  it('throws if order is called on it', assertThrows(
    'order cannot be called on the current query',
    () => data.limit(1).order('id').fetch()
  ))
} // Testing `limit`
