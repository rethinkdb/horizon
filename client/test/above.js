import 'rxjs/add/operator/do'
import 'rxjs/add/operator/toArray'

import {assertCompletes,
        assertThrows,
        assertErrors,
        compareWithoutVersion} from './utils'

export default function aboveSuite(getData) {
  return () => {
  let data

  before(() => {
    data = getData()
  })

  // By default `above` is closed
  it('is a closed bound by default', assertCompletes(() =>
    data.order('id').above({id: 5}).fetch()
      .do(res => compareWithoutVersion(res, [
        {id: 5, a: 60},
        {id: 6, a: 50},
      ]))
  ))

  // We can also pass that explicitly
  it('allows "closed" to be passed explicitly', assertCompletes(() =>
    data.order('id').above({id: 5}, 'closed').fetch()
      .do(res => compareWithoutVersion(res, [
        {id: 5, a: 60},
        {id: 6, a: 50},
      ]))
  ))

  // But we can make it open
  it('can return an open bounded result', assertCompletes(() =>
    data.order('id').above({id: 5}, 'open').fetch()
      .do(([res]) => compareWithoutVersion(res, {id: 6, a: 50}))
  ))

  // Let's try something that returns no values
  it('returns no results if bound eliminates all documents',
     assertCompletes(() =>
    data.order('id').above({id: 7}).fetch()
      .do(res => compareWithoutVersion(res, []))
  ))

  // We can chain `above` off a collection
  it('can be chained from a collection directly', assertCompletes(() =>
    data.above({id: 5}).fetch()
      .do(res => {
        assert.isArray(res)
        assert.lengthOf(res, 2)
      })
  ))

  // Or off other things
  it('can be chained from a findAll', assertCompletes(() =>
    data.findAll({a: 20}).above({id: 3}).fetch()
      .do(res => {
        assert.isArray(res)
        assert.lengthOf(res, 2)
      })
  ))

  // Let's try it on a non-primary key
  it('can be used on a non-primary key', assertCompletes(() =>
    data.order(['a', 'id']).above({a: 20}).fetch()
      .do(res => compareWithoutVersion(res, [
        {id: 2, a: 20, b: 1},
        {id: 3, a: 20, b: 2},
        {id: 4, a: 20, b: 3},
        {id: 6, a: 50},
        {id: 5, a: 60},
      ]))
  ))

  // Let's try it on a non-primary key, but open
  it('can be used on non-primary key with open bound', assertCompletes(() =>
    data.order(['a', 'id']).above({a: 20}, 'open').fetch()
      .do(res => compareWithoutVersion(res, [
        {id: 6, a: 50},
        {id: 5, a: 60},
      ]))
  ))
  // The key in `above` must be the first key in `order`
  it('must receive as an argument the first key in the order term', assertErrors(() =>
    data.order(['a', 'id']).above({id: 20}).fetch(),
    /"above" must be on the same field as the first in "order"/
  ))

  // Passing multiple keys to `above` isn't legal
  it('errors if multiple keys are passed', assertErrors(() =>
    data.order(['a', 'id']).above({a: 20, id: 20}).fetch(),
    /Object argument to "above" must have exactly one field./
  ))

  // Nor is passing a field that isn't specified in `order`
  it(`errors if the field passed isn't in the order term`, assertErrors(() =>
    data.order(['a', 'id']).above({b: 20}).fetch(),
    /"above" must be on the same field as the first in "order"./
  ))

  // If chaining `above/below`, they must be passed the same key
  it(`errors if it doesn't receive the same key as the below term`,
     assertErrors(() =>
    data.above({b: 0}).below({a: 100}).fetch(),
    /"below" must be on the same field as "above"./
  ))

  // Starting with `null` is not ok
  it('throws if it is passed null', assertErrors(
    () => data.above(null).fetch(),
    /First argument to "above" must be a string or object./
  ))

  // Empty value is not ok
  it('throws if it does not receive an argument', assertErrors(
    () => data.above().fetch(),
    /"above" expected 1 or 2 arguments but found 0./
  ))

  // Bad arguments are not ok
  it('errors if it receives a non-string argument', assertErrors(() =>
    data.above(1).fetch(),
    /First argument to "above" must be a string or object./
  ))
  it('errors if it receives more than one argument', assertErrors(() =>
    data.above({id: 1}, 1).fetch(),
    /Second argument to "above" must be "open" or "closed"./
  ))
}}
