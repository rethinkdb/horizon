import 'rxjs/add/operator/do'
import 'rxjs/add/operator/toArray'

import {assertCompletes,
        assertThrows,
        assertErrors,
        compareSetsWithoutVersion} from './utils'

export default function findAllSuite(getData) {
  return () => {
  let data

  before(() => {
    data = getData()
  })

  // Let's grab a specific document using `findAll`
  it('looks up documents by id when given a non-object', assertCompletes(() =>
    data.findAll(1).fetch()
      .do(res => compareSetsWithoutVersion(res, [{id: 1, a: 10}]))
  ))

  // This is equivalent to searching by field `id`
  it('looks up documents when the id field is given explicitly', assertCompletes(() =>
    data.findAll({id: 1}).fetch()
      .do(res => compareSetsWithoutVersion(res, [{id: 1, a: 10}]))
  ))

  // `findAll` returns `[]` if a document doesn't exist.
  it('returns nothing if no documents match', assertCompletes(() =>
    data.findAll('abracadabra').fetch()
      .do(res => compareSetsWithoutVersion(res, []))
  ))

  // We can also `findAll` by a different (indexed!) field.
  it('returns objects matching non-primary fields', assertCompletes(() =>
    data.findAll({a: 10}).fetch()
      .do(res => compareSetsWithoutVersion(res, [{id: 1, a: 10}]))
  ))

  // Let's try this again for a value that doesn't exist.
  it('returns nothing if no documents match the criteria', assertCompletes(() =>
    data.findAll({a: 100}).fetch()
      .do(res => compareSetsWithoutVersion(res, []))
  ))

  // Let's try this again for a field that doesn't exist.
  it(`returns nothing if the field provided doesn't exist`, assertCompletes(() =>
    data.findAll({field: 'a'}).fetch()
      .do(res => compareSetsWithoutVersion(res, []))
  ))

  // Let's try this again, now with multiple results.
  it('returns multiple values when several documents match', assertCompletes(() =>
    data.findAll({a: 20}).fetch()
      // There are three docs where `a == 20`
      .do(res => compareSetsWithoutVersion(res, [
        {id: 2, a: 20, b: 1},
        {id: 3, a: 20, b: 2},
        {id: 4, a: 20, b: 3},
      ]))
  ))

  // Looking for `null` is an error since secondary index values cannot be
  // `null` in RethinkDB.
  it('throws an error when null is passed', assertErrors(
    () => data.findAll(null).fetch(),
    /"findAll" argument 0 is not an object or valid index value./
  ))

  // No args is ok, because people will be using `apply`
  it('throws an error when passed no arguments', assertErrors(
    () => data.findAll().fetch(),
    /"findAll" expected 1 or more arguments but found 0./
  ))

  // Looking for an empty object is also an error
  it('errors when an empty object is passed', assertErrors(() =>
    data.findAll({}).fetch(),
    /"findAll" argument 0 object must have at least 1 field./
  ))

  // `findAll` lets us look for multiple documents. Let's try it on a primary
  // key.
  it('can be passed multiple documents to look for', assertCompletes(() =>
    data.findAll(1, {id: 2}, 20).fetch()
      // There are two docs where `a == 20`
      .do(res => compareSetsWithoutVersion(res, [
        {id: 1, a: 10},
        {id: 2, a: 20, b: 1},
      ]))
  ))

  // Let's try a mix of primary and secondary keys, with some missing
  it('can locate a mix of primary and secondary keys', assertCompletes(() =>
    data.findAll({a: 20}, {id: 200}, 1, {a: 200}).fetch()
      // There are three docs where `a == 20`
      .do(res => compareSetsWithoutVersion(res, [
        {id: 1, a: 10},
        {id: 2, a: 20, b: 1},
        {id: 3, a: 20, b: 2},
        {id: 4, a: 20, b: 3},
      ]))
  ))

  // Let's try when everything is missing
  it('returns nothing when nothing matches', assertCompletes(() =>
    data.findAll({field: 1}, 200, {a: 200}).fetch()
      .do(val => compareSetsWithoutVersion(val, []))
  ))

  // When one thing fails, everything fails.
  it('throws an error if any argument is null', assertErrors(
    () => data.findAll(1, null, 2).fetch(),
    /"findAll" argument 1 is not an object or valid index value./
  ))

  // Let's try it again with an empty object.
  it('errors if any argument passed is an empty object', assertErrors(() =>
    data.findAll(1, {}, {a: 20}).fetch(),
    /"findAll" argument 1 object must have at least 1 field./
  ))
}}
