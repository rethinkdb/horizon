import 'rxjs/add/operator/do'
import 'rxjs/add/operator/toArray'

import {assertCompletes,
        assertThrows,
        assertErrors,
        compareWithoutVersion} from './utils'

export default function limitSuite(getData) {
  return () => {
  let data

  before(() => {
    data = getData()
  })

  // Limit returns an array of documents
  it('can return an array of documents', assertCompletes(() =>
    data.order('id').limit(2).fetch()
      .do(res => compareWithoutVersion(res, [
        {id: 1, a: 10},
        {id: 2, a: 20, b: 1},
      ]))
  ))

  // We can chain `limit` off a collection
  it('can be called on a collection directly', assertCompletes(() =>
    data.limit(2).fetch()
      .do(res => {
        assert.isArray(res)
        assert.lengthOf(res, 2)
      })
  ))

  // Or off other things
  it('can be called on findAll', assertCompletes(() =>
    data.findAll({a: 20}).limit(2).fetch()
      .do(res => {
        assert.isArray(res)
        assert.lengthOf(res, 2)
      })
  ))

  // `limit(0)` is ok
  it('can accept an argument of 0', assertCompletes(() =>
    data.limit(0).fetch()
      .do(res => compareWithoutVersion(res, []))
  ))

  // `limit(null)` is an error
  it('throws if it receives null', assertErrors(
    () => data.limit(null).fetch(),
    /First argument to "limit" must be a number./
  ))

  // `limit(-1)` is an error
  it('errors if it receives a negative argument', assertErrors(() =>
    data.limit(-1).fetch(),
    /LIMIT takes a non-negative argument/
  ))

  // `limit(non_int)` is an error
  it(`errors if the argument to limit isn't a number`, assertErrors(() =>
    data.limit('k').fetch(),
    /First argument to "limit" must be a number./
  ))
}}
