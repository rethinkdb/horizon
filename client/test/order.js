import 'rxjs/add/operator/do'
import 'rxjs/add/operator/toArray'

import {assertCompletes,
        assertThrows,
        assertErrors,
        compareWithoutVersion} from './utils'

import cloneDeep from 'lodash.clonedeep'
import sortBy from 'lodash.sortby'

export default function orderSuite(getData, getTestData) {
  return () => {
  let data, testData

  before(() => {
    data = getData()
    testData = getTestData()
  })

  // We can order by a field (default order is ascending)
  it('orders results by a field', assertCompletes(() =>
    data.order('id').fetch()
      .do(res => compareWithoutVersion(res, testData))
  ))

  // That's the same as passing `ascending` explicitly
  it('orders results ascending implicitly', assertCompletes(() =>
    data.order('id', 'ascending').fetch()
      .do(res => compareWithoutVersion(res, testData))
  ))

  // We can also sort in descending order
  it('can order results in descending order', assertCompletes(() =>
    data.order('id', 'descending').fetch()
      .do(res => compareWithoutVersion(res, cloneDeep(testData).reverse()))
  ))

  // Let's try ordering by a different field.
  it('can order results by a field other than id', assertCompletes(() =>
    data.order('b').fetch()
      .do(res => compareWithoutVersion(res.slice(0, 3), [
        {id: 2, a: 20, b: 1},
        {id: 3, a: 20, b: 2},
        {id: 4, a: 20, b: 3},
      ]))
  ))

  // Let's try ordering by a different field descneding.
  it('can order results by another field in descending order', assertCompletes(() =>
    data.order('b', 'descending').fetch()
      .do(res => compareWithoutVersion(res.slice(0, 3), [
        {id: 4, a: 20, b: 3},
        {id: 3, a: 20, b: 2},
        {id: 2, a: 20, b: 1},
      ]))
  ))

  // Let's try to order by a missing field
  it('returns no documents if a bad field is given', assertCompletes(() =>
    data.order('abracadabra').fetch()
      .do(res => compareWithoutVersion(res, []))
  ))

  // We can pass multiple fields to `order` to disambiguate.
  it('can order by multiple fields', assertCompletes(() =>
    data.order(['a', 'id']).fetch()
      .do(res => compareWithoutVersion(res, sortBy(testData, ['a', 'id'])))
  ))

  // We can pass multiple fields to `order` to disambiguate. Let's do it in
  // descending order.
  it('can order by multiple fields descending', assertCompletes(() =>
    data.order(['a', 'id'], 'descending').fetch()
      .do(res => compareWithoutVersion(res, sortBy(testData, ['a', 'id']).reverse()))
  ))

  it(`errors if the 2nd argument isn't 'ascending' or 'descending'`,
     assertErrors(() => data.order('id', 'foo').fetch(),
     /Second argument to "order" must be "ascending" or "descending"./
  ))

  // Passing no arguments, null, bad arguments, or too many arguments is
  // an error.
  it('throws if it receives no arguments', assertErrors(
    () => data.order().fetch(),
    /"order" expected 1 or 2 arguments but found 0./
  ))
  it('throws if it receives a null argument', assertErrors(
    () => data.order(null).fetch(),
    /First argument to "order" must be an array or string./
  ))
  it('throws if its first argument is null', assertErrors(
    () => data.order(null, 'foo').fetch(),
    /First argument to "order" must be an array or string./
  ))
  it('throws if it receives more than 2 arguments', assertErrors(
    () => data.order('id', 'ascending', 1).fetch(),
    /"order" expected 1 or 2 arguments but found 3./
  ))
}}
