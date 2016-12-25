import 'rxjs/add/operator/do'
import 'rxjs/add/operator/toArray'

import {assertCompletes,
        assertErrors,
        compareWithoutVersion} from './utils'

export default function belowSuite(getData) {
  return () => {
  let data

  before(() => {
    data = getData()
  })

  // By default `below` is open
  it('defaults to open', assertCompletes(() =>
    data.order('id').below({id: 3}).fetch()
      .do(res => compareWithoutVersion(res, [
        {id: 1, a: 10},
        {id: 2, a: 20, b: 1}
      ]))
  ))

  // We can also pass that explicitly
  it('can be explicitly set to be an open bound', assertCompletes(() =>
    data.order('id').below({id: 3}, 'open').fetch()
      .do(res => compareWithoutVersion(res, [
        {id: 1, a: 10},
        {id: 2, a: 20, b: 1},
      ]))
  ))

  // But we can make it closed
  it('can be explicitly set to be a closed bound', assertCompletes(() =>
    data.order('id').below({id: 3}, 'closed').fetch()
      .do(res => compareWithoutVersion(res, [
        {id: 1, a: 10},
        {id: 2, a: 20, b: 1},
        {id: 3, a: 20, b: 2},
      ]))
  ))

  // Let's try something that returns no values
  it('can return no values', assertCompletes(() =>
    data.order('id').below({id: 0}).fetch()
      .do(res => compareWithoutVersion(res, []))
  ))

  // We can chain `below` off a collection
  it('can be chained off of a collection', assertCompletes(() =>
    data.below({id: 3}).fetch()
      .do(res => {
        assert.isArray(res)
        assert.lengthOf(res, 2)
      })
  ))

  // Or off other things
  it('can be chained off of a findAll term', assertCompletes(() =>
    data.findAll({a: 20}).below({id: 4}).fetch()
      .do(res => {
        assert.isArray(res)
        assert.lengthOf(res, 2)
      })
  ))

  // Let's try it on a non-primary index
  it('can bound a non-primary index', assertCompletes(() =>
    data.order(['a', 'id']).below({a: 20}).fetch()
      .do(([res]) => compareWithoutVersion(res, {id: 1, a: 10}))
  ))

  // Let's try it on a non-primary key, but closed
  it('can closed bound a non-primary key', assertCompletes(() =>
    data.order(['a', 'id']).below({a: 20}, 'closed').fetch()
      .do(res => compareWithoutVersion(res, [
        {id: 1, a: 10},
        {id: 2, a: 20, b: 1},
        {id: 3, a: 20, b: 2},
        {id: 4, a: 20, b: 3},
      ]))
  ))

  // The key in `below` must be the first key in `order`
  it('must receive as an argument the first key in the order term', assertErrors(() =>
    data.order(['a', 'id']).below({id: 20}).fetch(),
    /"below" must be on the same field as the first in "order"/
  ))

  // Passing multiple keys to `below` isn't legal
  it('errors if it receives multiple keys', assertErrors(() =>
    data.order(['a', 'id']).below({a: 20, id: 20}).fetch(),
    /Object argument to "below" must have exactly one field./
  ))

  // Nor is passing a field that isn't specified in `order`
  it(`errors if it receives a field that wasn't passed to the order term`,
     assertErrors(() =>
    data.order(['a', 'id']).below({b: 20}).fetch(),
    /"below" must be on the same field as the first in "order"./
  ))

  // If chaining `below/above`, they must be passed the same key
  it('must be passed the same key as the above term', assertErrors(() =>
    data.below({a: 100}).above({b: 0}).fetch(),
    /"below" must be on the same field as "above"./
  ))

  // Starting with `null` is not ok
  it('throws if passed null', assertErrors(
    () => data.below(null).fetch(),
    /First argument to "below" must be a string or object./
  ))

  // Empty value is not ok
  it('throws if not given an argument', assertErrors(
    () => data.below().fetch(),
    /"below" expected 1 or 2 arguments but found 0./
  ))

  // Bad arguments are not ok
  it('errors if passed a non-string', assertErrors(() =>
    data.below(1).fetch(),
    /First argument to "below" must be a string or object./
  ))
  it('errors if it receives a bound other than open or closed', assertErrors(() =>
    data.below({id: 1}, 1).fetch(),
    /Second argument to "below" must be "open" or "closed"./
  ))
}}
