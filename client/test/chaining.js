'use strict'
const chainingSuite = window.chainingSuite = (getData) => () => {
  let data

  before(() => {
    data = getData()
  })

  // Let's do a biiig chain
  it('findAll.order.above.below', assertCompletes(() =>
    data.findAll({ a: 20 })
      .order('id')
      .above({ id: 2 })
      .below({ id: 4 })
      .fetch({ asCursor: false })
      .do(res => assert.deepEqual(res, [
        { id: 2, a: 20, b: 1 },
        { id: 3, a: 20, b: 2 }
      ]))
  ))

  // Let's flip it the other way and change the order
  it('findAll.below.above.order(desc)', assertCompletes(() =>
    data.findAll({ a: 20 })
      .below({ id: 4 })
      .above({ id: 2 })
      .order('id', 'descending')
      .fetch({ asCursor: false })
      .do(res => assert.deepEqual(res, [
        { id: 3, a: 20, b: 2 },
        { id: 2, a: 20, b: 1 },
      ]))
  ))

  // Let's throw limit into the mix
  it('findAll.order.above.below.limit', assertCompletes(() =>
    data.findAll({ a: 20 })
      .above({ id: 2 })
      .order('id').below({ id: 4 }).limit(1)
      .fetch({ asCursor: false })
      .do(res => assert.deepEqual(res, [{ id: 2, a: 20, b: 1 }]))
  ))

  // Let's do it on the collection
  it('order.above.below.limit', assertCompletes(() =>
    data.below({ id: 4 })
      .order('id')
      .above({ id: 2 })
      .limit(1)
      .fetch({ asCursor: false })
      .do(res => assert.deepEqual(res, [{ id: 2, a: 20, b: 1 }]))
  ))

  // Let's try a big compound example
  it('findAll.order.above.below.limit', assertCompletes(() =>
    data.findAll({ a: 20 })
      .order('id')
      .above({ id: 2 })
      .below({ id: 4 }, 'closed')
      .limit(2)
      .fetch({ asCursor: false })
      .do(res => assert.deepEqual(res, [
        { id: 2, a: 20, b: 1 },
        { id: 3, a: 20, b: 2 },
      ]))
  ))

  // Can't chain off vararg `findAll`
  it(`throws if order is chained off a multi-arg findAll`, assertThrows(
    'order cannot be called on the current query',
    () => data.findAll({ a: 20 }, { a: 50 }).order('id').fetch()
  ))
} // Testing more advanced chaining
