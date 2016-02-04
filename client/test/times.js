'use strict'
const timesSuite = getData => () => {
  let data

  before(() => {
    data = getData()
  })

  let range = count => Array.from(Array(count).keys())

  beforeEach(done => {
    const rows = range(16).map(i => (
      {
        id: i,
        value: i % 4,
        time: new Date(Math.floor(i / 4)),
      }
    ))
    data.store(rows).toArray()
      .do(res => {
        assert.isArray(res)
        assert.lengthOf(res, 16)
      })
      .subscribe(doneObserver(done))
  })

  it('finds a document by a field with a time value', done => {
    data.find({ time: new Date(0) }).fetch()
      .do(res => assert.deepEqual(res, { id: 0, time: new Date(0), value: 0 }))
      .subscribe(doneObserver(done))
  })

  it('finds a document by a time field and another field', done => {
    data.find({ value: 1, time: new Date(3) }).fetch()
      .do(res => assert.deepEqual(res, { id: 13, value: 1, time: new Date(3) }))
      .subscribe(doneObserver(done))
  })

  it('finds all documents by a field with a time value', done => {
    data.findAll({ time: new Date(2) }).fetch({ asCursor: false })
      .do(res => assert.deepEqual(res, range(4).map(i => ({
        id: i + 8,
        value: i,
        time: new Date(2)
      }))))
      .subscribe(doneObserver(done))
  })

  it('finds all documents by a time field and another field', done => {
    data.findAll({ value: 2, time: new Date(3) }).fetch({ asCursor: false })
      .do(res =>
          assert.deepEqual(res, [ { id: 14, value: 2, time: new Date(3) } ]))
      .subscribe(doneObserver(done))
  })

  it('finds all documents bounded above by a time', done => {
    data.findAll({ value: 3 })
      .above({ time: new Date(1) })
      .fetch({ asCursor: false })
      .do(res => assert.deepEqual(res, range(3).map(i => ({
        id: 3 + (i + 1) * 4,
        value: 3,
        time: new Date(i + 1),
      }))))
      .subscribe(doneObserver(done))
  })

  it('finds all documents between two times', done => {
    data.findAll({ value: 2 })
      .above({ time: new Date(1) })
      .below({ time: new Date(3) })
      .fetch({ asCursor: false })
      .do(res => assert.deepEqual(res, [
        { id: 6, value: 2, time: new Date(1) },
        { id: 10, value: 2, time: new Date(2) },
      ]))
      .subscribe(doneObserver(done))
  })
} // Testing `find`
