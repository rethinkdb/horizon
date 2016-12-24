import 'rxjs/add/operator/concat'

import {assertCompletes, observableInterleave} from './utils'

export default function findAllSubscriptionSuite(getData) {
  return () => {
  let data

  before(() => {
    data = getData()
  })

  // Let's grab a specific document using 'findAll'
  it('can find a single document', assertCompletes(() =>
    observableInterleave({
      query: data.findAll(1).watch(),
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

  // Let's grab a specific document using 'findAll' and also test the 'changed'
  // event.
  it('can find a document and reflect changes', assertCompletes(() =>
    observableInterleave({
      query: data.findAll(1).watch(),
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

  // Let's make sure we don't see events that aren't ours
  it("doesn't see changes to documents outside its range", assertCompletes(() =>
    observableInterleave({
      query: data.findAll(1).watch(),
      operations: [
        data.store({id: 2, a: 1})
          .concat(data.store({id: 2, a: 2}))
          .concat(data.remove(2)),
      ],
      expected: [
        [],
      ],
    })
  ))

  // Let's try subscribing to multiple IDs
  it('can subscribe to multiple ids', assertCompletes(() =>
    observableInterleave({
      query: data.findAll(1, 2).watch(),
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
  it('properly handles initial values', assertCompletes(() =>
    data.store([{id: 1, a: 1}, {id: 2, b: 1}]).concat(
      observableInterleave({
        query: data.findAll(1, 2).watch(),
        operations: [
          data.store({id: 1, a: 2}),
          data.remove(2),
          data.remove(1),
        ],
        expected: [
          [{id: 1, a: 1}, {id: 2, b: 1}],
          [{id: 1, a: 2}, {id: 2, b: 1}],
          [{id: 1, a: 2}],
          [],
        ],
      })
    )
  ))
}}
