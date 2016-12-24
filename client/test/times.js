import 'rxjs/add/operator/do'
import 'rxjs/add/operator/toArray'

import {assertCompletes,
        compareWithoutVersion,
        removeAllData} from './utils'

export default function timesSuite(getData) {
  return () => {
  let data

  before(() => {
    data = getData()
  })

  after(done => {
    removeAllData(data, done)
  })

  let range = count => Array.from(Array(count).keys())

  beforeEach(assertCompletes(() => {
    const rows = range(16).map(i => (
      {
        id: i,
        value: i % 4,
        time: new Date(Math.floor(i / 4)),
      }
    ))
    return data.store(rows).toArray()
      .do(res => {
        assert.isArray(res)
        assert.lengthOf(res, 16)
      })
  }))

  it('finds a document by a field with a time value', assertCompletes(() =>
    data.find({time: new Date(0)}).fetch()
      .do(res => compareWithoutVersion(res, {
        id: 0,
        time: new Date(0),
        value: 0,
      }))
  ))

  it('finds a document by a time field and another field', assertCompletes(() =>
    data.find({value: 1, time: new Date(3)}).fetch()
      .do(res => compareWithoutVersion(res, {
        id: 13,
        value: 1,
        time: new Date(3),
      }))
  ))

  it('finds all documents by a field with a time value', assertCompletes(() =>
    data.findAll({time: new Date(2)}).fetch()
      .do(res => compareWithoutVersion(res, range(4).map(i => ({
        id: i + 8,
        value: i,
        time: new Date(2),
      }))))
  ))

  it('finds all documents by a time field and another field', assertCompletes(() =>
    data.findAll({value: 2, time: new Date(3)}).fetch()
      .do(res => compareWithoutVersion(res, [{
        id: 14,
        value: 2,
        time: new Date(3),
      }]))
  ))

  it('finds all documents bounded above by a time', assertCompletes(() =>
    data.findAll({value: 3})
      .above({time: new Date(1)})
      .fetch()
      .do(res => compareWithoutVersion(res, range(3).map(i => ({
        id: 3 + (i + 1) * 4,
        value: 3,
        time: new Date(i + 1),
      }))))
  ))

  it('finds all documents between two times', assertCompletes(() =>
    data.findAll({value: 2})
      .above({time: new Date(1)})
      .below({time: new Date(3)})
      .fetch()
      .do(res => compareWithoutVersion(res, [
        {id: 6, value: 2, time: new Date(1)},
        {id: 10, value: 2, time: new Date(2)},
      ]))
  ))
}}
