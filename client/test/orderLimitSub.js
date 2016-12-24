import 'rxjs/add/operator/concat'

import {assertCompletes, observableInterleave} from './utils'

export default function orderLimitSubSuite(getData) {
  return () => {
  let data

  before(() => {
    data = getData()
  })

  it(`can find a single document`, assertCompletes(() =>
    observableInterleave({
      query: data.order('score').limit(1).watch(),
      operations: [
        data.store({id: 1, score: 1}),
        data.remove(1),
      ],
      expected: [
        [],
        [{id: 1, score: 1}],
        [],
      ],
    })
  ))

  it('will swap out a document that goes out of range', assertCompletes(() =>
    data.store({id: 1, score: 200}).concat(
      observableInterleave({
        query: data.order('score').limit(1).watch(),
        operations: [
          data.store({id: 2, score: 100}),
          data.remove(2),
          data.remove(1),
        ],
        expected: [
          [{id: 1, score: 200}],
          [{id: 2, score: 100}],
          [{id: 1, score: 200}],
          [],
        ],
      })
    )
  ))

  it('reflects changes that change sort order', assertCompletes(() =>
    observableInterleave({
      query: data.order('score').limit(2).watch(),
      operations: [
        data.store({id: 1, score: 200}),
        data.store({id: 2, score: 100}),
        data.store({id: 1, score: 50}),
        data.remove(1),
        data.remove(2),
      ],
      expected: [
        [],
        [{id: 1, score: 200}],
        [{id: 2, score: 100}, {id: 1, score: 200}],
        [{id: 1, score: 50}, {id: 2, score: 100}],
        [{id: 2, score: 100}],
        [],
      ],
    })
  ))

  // Let's make sure we don't see events that aren't ours
  it("doesn't see changes to documents outside its range", assertCompletes(() =>
    observableInterleave({
      query: data.order('score').limit(1).watch(),
      operations: [
        data.store({id: 1, score: 100})
          .concat(data.store({id: 2, score: 200}))
          .concat(data.remove(2))
          .concat(data.remove(1)),
      ],
      expected: [
        [],
        [{id: 1, score: 100}],
        [],
      ],
    })
  ))

  // Let's try subscribing to multiple IDs
  it('respects descending order', assertCompletes(() =>
    observableInterleave({
      query: data.order('score', 'descending').limit(3).watch(),
      operations: [
        data.store({id: 1, score: 10}),
        data.store({id: 2, score: 20}),
        data.store({id: 3, score: 15}),
        data.remove(2),
        data.remove(1),
        data.remove(3),
      ],
      expected: [
        [],
        [{id: 1, score: 10}],
        [{id: 2, score: 20}, {id: 1, score: 10}],
        [{id: 2, score: 20}, {id: 3, score: 15}, {id: 1, score: 10}],
        [{id: 3, score: 15}, {id: 1, score: 10}],
        [{id: 3, score: 15}],
        [],
      ],
    })
  ))

  it('properly handles documents coming in and out of range', assertCompletes(() =>
    observableInterleave({
      query: data.order('score').limit(2).watch(),
      operations: [
        data.store({id: 1, score: 100}), // after 1, results in 2
        data.store({id: 2, score: 200}), // after 2, results in 3
        data.store({id: 3, score: 300})
          .concat(data.store({id: 3, score: 50})),  // after 3, results in 4
        data.remove(1), // after 4, results in 5
        data.store({id: 2, score: 20}), // after 5, results in 6
        data.remove(2), // after 6, results in 7
        data.remove(3), // after 7, results in 8
      ],
      expected: [
        [], // 1
        [{id: 1, score: 100}], // 2
        [{id: 1, score: 100}, {id: 2, score: 200}], // 3
        [{id: 3, score: 50}, {id: 1, score: 100}], // 4
        [{id: 3, score: 50}, {id: 2, score: 200}], // 5
        [{id: 2, score: 20}, {id: 3, score: 50}], // 6
        [{id: 3, score: 50}], // 7
        [], // 8
      ],
    })
  ))
}}
