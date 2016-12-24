import 'rxjs/add/operator/concat'

import {assertCompletes, observableInterleave} from './utils'

export default function findSubscriptionSuite(getData) {
  return () => {
  let data

  before(() => {
    data = getData()
  })
  it('returns an updating document', assertCompletes(() =>
    observableInterleave({
      query: data.find(1).watch(),
      operations: [
        data.insert({id: 1, val: 'foo'}),
        data.replace({id: 1, val: 'bar'}),
        data.remove({id: 1}),
      ],
      expected: [
        null,
        {id: 1, val: 'foo'},
        {id: 1, val: 'bar'},
        null,
      ],
    })
  ))

  // Let's grab a specific document using `find`
  it('receives results from store operations', assertCompletes(() =>
    observableInterleave({
      query: data.find(1).watch(),
      operations: [
        data.store({id: 1, a: 1}),
        data.store({id: 1, a: 2}),
        data.remove(1),
      ],
      expected: [
        null,
        {id: 1, a: 1},
        {id: 1, a: 2},
        null,
      ],
    })
  ))

  // Let's make sure we don't see events that aren't ours
  it("doesn't see events that don't belong to it", assertCompletes(() =>
    observableInterleave({
      query: data.find(1).watch(),
      operations: [ // only one operation
        data.store({id: 2, a: 1}) // irrelevant
          .concat(data.store({id: 2, a: 2})) // irrelevant
          .concat(data.insert({id: 1, data: 'blep'})) // relevant
          .concat(data.remove(2)), // removing irrelevant
        data.remove(1), // triggered after relevant only
      ],
      expected: [
        null,
        {id: 1, data: 'blep'},
        null,
      ],
    })
  ))

  // Let's make sure initial vals works correctly
  it('properly handles initial values', assertCompletes(() =>
    // before starting the feed, insert initial document
    data.store({id: 1, a: 1})
      .concat(observableInterleave({
        query: data.find(1).watch(),
        operations: [
          data.store({id: 1, a: 2}),
          data.remove(1),
        ],
        expected: [
          {id: 1, a: 1},
          {id: 1, a: 2},
          null,
        ],
      })
    )
  ))

  it('emits null when the document id is not found', assertCompletes(() => {
    return observableInterleave({
      query: data.find('does_not_exist').watch(),
      operations: [],
      expected: [null],
    })
  }))
}}
