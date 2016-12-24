import 'rxjs/add/operator/concat'

import {assertCompletes, observableInterleave} from './utils'

export default function belowSubscriptionSuite(getData) {
  return () => {
  let data

  before(() => {
    data = getData()
  })

  // Let's grab a specific document using 'below'
  it('can grab a specific document', assertCompletes(() =>
    observableInterleave({
      query: data.below({id: 2}).watch(),
      operations: [
        data.store({id: 1, a: 1}),
        data.remove(1),
      ],
      expected: [
        [],
        [{id: 1, a: 1}],
        [],
      ],
    })
  ))

  // Let's grab a specific document using 'below' and also test the 'changed'
  // event.
  it('properly handles changes to documents in its range', assertCompletes(() =>
    observableInterleave({
      query: data.below({id: 2}).watch(),
      operations: [
        data.store({id: 1, a: 1}),
        data.store({id: 1, a: 2}),
        data.remove(1),
      ],
      expected: [
        [],
        [{id: 1, a: 1}],
        [{id: 1, a: 2}],
        [],
      ]
    })
  ))

  // Secondary index, closed
  it('can find documents by secondary index with closed bound', assertCompletes(() =>
    observableInterleave({
      query: data.below({a: 2}, 'closed').watch(),
      operations: [
        data.store({id: 1, a: 1}),
        data.store({id: 1, a: 2}),
        data.remove(1),
      ],
      expected: [
        [],
        [{id: 1, a: 1}],
        [{id: 1, a: 2}],
        [],
      ]
    })
  ))

  // Let's make sure we don't see events that aren't ours
  it("doesn't see updates to documents outside its range", assertCompletes(() =>
    observableInterleave({
      query: data.below({id: 1}).watch(),
      operations: [
        data.store({id: 2, a: 1})
          .concat(data.store({id: 2, a: 2}))
          .concat(data.store({id: 0, val: 'foo'})),
        data.remove(2)
          .concat(data.remove(0)),
      ],
      expected: [
        [],
        [{id: 0, val: 'foo'}],
        [],
      ],
    })
  ))

  // Let's try subscribing to multiple IDs
  it('can subscribe to multiple ids', assertCompletes(() =>
    observableInterleave({
      query: data.below({id: 3}).watch(),
      operations: [
        data.store({id: 1, a: 1}),
        data.store({id: 2, a: 1})
        .concat(data.store({id: 3, a: 1})),
        data.store({id: 1, a: 2}),
        data.store({id: 2, a: 2})
          .concat(data.store({id: 3, a: 2})),
        data.remove(1),
        data.remove(2)
          .concat(data.remove(3)),
      ],
      expected: [
        [],
        [{id: 1, a: 1}],
        [{id: 1, a: 1}, {id: 2, a: 1}],
        [{id: 1, a: 2}, {id: 2, a: 1}],
        [{id: 1, a: 2}, {id: 2, a: 2}],
        [{id: 2, a: 2}],
        [],
      ],
    })
  ))

  // Let's make sure initial vals works correctly
  it('handles initial values correctly', assertCompletes(() =>
    data.store({id: 1, a: 1}).concat(
      observableInterleave({
        query: data.below({id: 2}).watch(),
        operations: [
          data.store({id: 1, a: 2}),
          data.remove(1),
        ],
        expected: [
          [{id: 1, a: 1}],
          [{id: 1, a: 2}],
          [],
        ],
      })
    )
  ))
}}
