import 'rxjs/add/operator/concat'

import { assertCompletes, observableInterleave } from './utils'
import { oit } from './observableUtils'

export default function findSubscriptionSuite(getData) {
  return () => {
  let data

  before(() => {
    data = getData()
  })

  oit('returns an updating document', t => {
    t.subscribeTo(data.find(1).watch())
      .expect(null)
      .do(data.insert({ id: 1, val: 'foo' }))
      .expect({ id: 1, val: 'foo' })
      .do(data.replace({ id: 1, val: 'bar' }))
      .expect({ id: 1, val: 'bar' })
      .do(data.remove({ id: 1 }))
      .expect(null)
      .done()
  })

  oit('receives results from store operations', t => {
    t.subscribeTo(data.find(1).watch())
      .expect(null)
      .do(data.store({ id: 1, a: 1 }))
      .expect({ id: 1, a: 1 })
      .do(data.store({ id: 1, a: 2 }))
      .expect({ id: 1, a: 2 })
      .do(data.remove(1))
      .expect(null)
      .done()
  })

  oit("doesn't see events that don't belong to it", t => {
    t.subscribeTo(data.find(1).watch())
      .expect(null)
      .do(data.store({ id: 2, a: 1 })) // irrelevant
      .do(data.store({ id: 2, a: 2 })) // irrelevant
      .do(data.insert({ id: 1, data: 'blep' })) // relevant
      .do(data.remove(2)) // irrelevant
      .expect({ id: 1, data: 'blep' })
      .do(data.remove(1))
      .expect(null)
      .done()
  })

  oit('properly handles initial values', t => {
    t.beforeHand(data.store([ { id: 1, a: 1 } ]))
      .subscribeTo(data.find(1).watch())
      .expect({ id: 1, a: 1 })
      .do(data.store({ id: 1, a: 2 }))
      .expect({ id: 1, a: 2 })
      .do(data.remove(1))
      .expect(null)
      .complete()
  })

  oit('emits null when the document id is not found', t => {
    t.subscribeTo(data.find('does_not_exist').watch())
     .expect(1)
     .done()
  })
}}
