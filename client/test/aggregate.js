import Rx from 'rxjs/Rx'

import {assertCompletes,
        removeAllDataObs,
        compareSetsWithoutVersion,
        observableInterleave} from './utils'

// Raises an exception if corresponding elements in an array don't
// have the same elements (in any order)
function arrayHasSameElements(a, b) {
  if (a.length !== b.length) {
    return false
  }
  for (let i = 0; i < a.length; i++) {
    assert.sameDeepMembers(a[i], b[i])
  }
}

export default function aggregateSuite(getData, getHorizon) {
  return () => {
  let data, horizon, hzA, hzB
  before(() => {
    data = getData()
    horizon = getHorizon()
    hzA = horizon('testA')
    hzB = horizon('testB')
  })
  afterEach(done => {
    removeAllDataObs(data)
    .concat(removeAllDataObs(hzA))
    .concat(removeAllDataObs(hzB))
      .subscribe({
        next() { },
        error(err) { done(err) },
        complete() { done() },
      })
  })

  it('is equivalent to a subquery if it is not passed an object',
     assertCompletes(() => {
       const underlyingQuery = data.order('id').limit(3)
       return data.insert([
         {id: 1},
         {id: 2},
         {id: 3},
         {id: 4},
       ]).concat(observableInterleave({
         query: horizon.aggregate(underlyingQuery).fetch(),
         operations: [],
         expected: [
           [{id: 1}, {id: 2}, {id: 3}],
         ],
       }))
     })
    )

  it('combines multiple queries in an array into one',
     assertCompletes(() => {
       const query = horizon.aggregate([hzA, hzB]).fetch()
       const expected = [
         [{id: 1}, {id: 3}],
         [{id: 2}, {id: 4}],
       ]
       return hzA.insert([
         {id: 1},
         {id: 3},
       ]).concat(hzB.insert([
         {id: 2},
         {id: 4},
       ])).concat(observableInterleave({
         query,
         operations: [],
         equality: compareSetsWithoutVersion,
         expected: [expected],
       }))
     })
    )

  it('allows constants in an array spec', assertCompletes(() => {
    const query = horizon.aggregate([1, hzA]).fetch()
    const expected = [1, [{id: 1}, {id: 2}]]
    return hzA.insert([
      {id: 1},
      {id: 2},
    ]).concat(observableInterleave({
      query,
      operations: [],
      equality: compareSetsWithoutVersion,
      expected: [expected],
    }))
  }))

  it('allows a fully constant aggregate of primitives', assertCompletes(() => {
    const agg = {
      a: 'Some string',
      b: [true],
      c: new Date(),
      d: {
        e: new ArrayBuffer(),
        f: 1.2,
        g: [1.3, true, new Date(), {}],
      },
    }

    return observableInterleave({
      query: horizon.aggregate(agg).fetch(),
      operations: [],
      equality: assert.deepEqual,
      expected: [agg],
    })
  }))

  it('aggregates data from objects', assertCompletes(() => {
    const hzAContents = [
      {id: 1, a: true},
      {id: 2, b: false},
      {id: 3, c: true},
      {id: 4, d: true},
    ]
    const hzBContents = [
      {id: 5, e: 'E'},
      {id: 6, f: 'F'},
      {id: 7, g: 'G'},
      {id: 8, h: 'H'},
    ]
    const query = horizon.aggregate({
      item1: hzA.find(1),
      item2: hzB.above({id: 5}).below({id: 8}),
    }).fetch()
    const expectedResult = {
      item1: {id: 1, a: true},
      item2: [
        {id: 5, e: 'E'},
        {id: 6, f: 'F'},
        {id: 7, g: 'G'},
      ],
    }
    return hzA.insert(hzAContents).concat(hzB.insert(hzBContents))
    .concat(observableInterleave({
      query,
      operations: [],
      expected: [expectedResult],
    }))
  }))

  it('allows observables in aggregates', assertCompletes(() => {
    const hzAContents = [
      {id: 1, foo: true},
    ]
    const constantObservable = Rx.Observable.of({id: 2, foo: false})
    assert.instanceOf(constantObservable, Rx.Observable)
    const regularConstant = {id: 3, foo: true}
    const expectedResult = {
      a: {id: 1, foo: true},
      b: {id: 2, foo: false},
      c: {id: 3, foo: true},
      d: {id: 4, foo: false},
    }
    return hzA.insert(hzAContents)
      .concat(observableInterleave({
        query: horizon.aggregate({
          a: hzA.find(1),
          b: constantObservable,
          c: regularConstant,
          d: Promise.resolve({id: 4, foo: false}),
        }).fetch(),
        operations: [],
        expected: [expectedResult],
      }))
  }))

  it('allows nested aggregates with queries at different levels',
     assertCompletes(() => {
       const hzAContents = [
         {id: 1, contents: 'a'},
         {id: 2, contents: 'b'},
         {id: 3, contents: 'c'},
       ]
       const hzBContents = [
         {id: 4, contents: 'd'},
         {id: 5, contents: 'e'},
         {id: 6, contents: 'f'},
       ]
       const query = horizon.aggregate({
         a: hzA.find(1),
         b: {
           c: hzB.find(4),
           d: hzB.find(5),
           e: {
             f: [hzA.find(2), hzA.find(3)],
           },
         },
       }).fetch()
       const expectedResult = {
         a: {id: 1, contents: 'a'},
         b: {
           c: {id: 4, contents: 'd'},
           d: {id: 5, contents: 'e'},
           e: {
             f: [{id: 2, contents: 'b'}, {id: 3, contents: 'c'}],
           },
         },
       }
       return hzA.insert(hzAContents)
         .concat(hzB.insert(hzBContents))
         .concat(observableInterleave({
           query,
           operations: [],
           expected: [expectedResult],
         }))
     }
  ))

  it('can be parameterized with .model',
     assertCompletes(() => {
       const hzAContents = [
         {id: 1, contents: 'a'},
         {id: 2, contents: 'b'},
         {id: 3, contents: 'c'},
       ]
       const hzBContents = [
         {id: 1, contents: 'd'},
         {id: 2, contents: 'e'},
         {id: 3, contents: 'f'},
       ]
       const Model = horizon.model((foo, bar, baz) => ({
         a: hzA.find(foo),
         b: {
           c: hzB.find(foo),
           d: hzB.find(bar),
           e: {
             f: [hzA.find(bar), hzA.find(baz)],
           },
         },
       }))
       const expectedResult = {
         a: {id: 1, contents: 'a'},
         b: {
           c: {id: 1, contents: 'd'},
           d: {id: 2, contents: 'e'},
           e: {
             f: [{id: 2, contents: 'b'},
                 {id: 3, contents: 'c'}],
           },
         },
       }
       return hzA.insert(hzAContents)
         .concat(hzB.insert(hzBContents))
         .concat(observableInterleave({
           query: Model(1, 2, 3).fetch(),
           operations: [],
           expected: [expectedResult],
         }))
  }))
}}
