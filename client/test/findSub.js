import 'rxjs/add/operator/concat'

import { removeAllData,
         assertCompletes,
         compareSetsWithoutVersion } from './utils'
import { oit } from './observableUtils'

export default function findSubscriptionSuite() {
  return () => {
  const horizon = Horizon({ lazyWrites: true })
  const data = horizon('test_data')
  const testData = [
    { id: 1, a: 10 },
    { id: 2, a: 20, b: 1 },
    { id: 3, a: 20, b: 2 },
    { id: 4, a: 20, b: 3 },
    { id: 5, a: 60 },
    { id: 6, a: 50 },
  ]

  before(() => {
    horizon.connect()
    return assertCompletes(() => {
      return data.store(testData)
        .do(x => console.log('stored', x))
        .ignoreElements()
        .concat(data.fetch())
        .do(res => compareSetsWithoutVersion(res, testData))
    })
  })

  after(done => removeAllData(data, done))


  oit('returns an updating document', t => {
    t.subscribeTo(data.find(1).watch())
      .expect(null)
      .do(data.insert({ id: 1, val: 'foo' }))
      .expect({ id: 1, val: 'foo' })
      .do(data.replace({ id: 1, val: 'bar' }))
      .expect({ id: 1, val: 'bar' })
      .do(data.remove({ id: 1 }))
      .expect(null)
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
  })

  oit('properly handles initial values', t => {
    t.beforeHand(data.store([ { id: 1, a: 1 } ]))
      .subscribeTo(data.find(1).watch())
      .expect({ id: 1, a: 1 })
      .do(data.store({ id: 1, a: 2 }))
      .expect({ id: 1, a: 2 })
      .do(data.remove(1))
      .expect(null)
      .expectComplete()
  })

  oit('emits null when the document id is not found', t => {
    t.subscribeTo(data.find('does_not_exist').watch())
     .expect(null)
  })
}}
