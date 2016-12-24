import 'rxjs/add/operator/concat'

import {assertCompletes, observableInterleave} from './utils'

export default function aboveSubscriptionSuite(getData) {
  return () => {
  let data

  before(() => {
    data = getData()
  })

  // Let's grab a specific document using 'above'
  it('can get a specific document', assertCompletes(() =>
    observableInterleave({
      query: data.above({id: 1}).watch(),
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

  // Let's grab a specific document using 'above' and also test the
  // 'changed' event.
  it('can get a document and reflect changes to it', assertCompletes(() =>
    observableInterleave({
      query: data.above({id: 1}).watch(),
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
      ],
    })
  ))

  // Secondary index, open
  it('can get a document by secondary index with open bound', assertCompletes(() =>
    observableInterleave({
      query: data.above({a: 0}, 'open').watch(),
      operations: [
        data.store({id: 1, a: 0})
          .concat(data.store({id: 1, a: 1})),
        data.store({id: 1, a: 2}),
        data.remove(1),
      ],
      expected: [
        [],
        [{id: 1, a: 1}],
        [{id: 1, a: 2}],
        [],
      ],
    })
  ))

  // Let's make sure we don't see events that aren't ours
  it("doesn't see updates to documents outside its bound", assertCompletes(() =>
    observableInterleave({
      query: data.above({id: 3}).watch(),
      operations: [
        data.store({id: 2, a: 1})
          .concat(data.store({id: 2, a: 2}))
          .concat(data.store({id: 3, val: 'foo'}))
          .concat(data.remove(2)),
        data.remove(3),
      ],
      expected: [
        [],
        [{id: 3, val: 'foo'}],
        [],
      ],
    })
  ))

  // Let's try subscribing to multiple IDs
  it('can subscribe to multiple ids', assertCompletes(() =>
    observableInterleave({
      query: data.above({id: 1}).below({id: 3}, 'open').watch(),
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
        query: data.above({id: 1}).watch(),
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
