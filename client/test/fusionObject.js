'use strict'

// Test object creation, the `dispose` method, and `connected/disconnected`
// events.

var fusionObjectSuite = () => {
  describe('Fusion', () => {
    it('connects and can track its status', done => {
      const fusion = Fusion('localhost:8181', { secure: false })
      assert.isDefined(fusion)
      fusion.status(
        stat => {
          switch (stat.type) {
          case 'unconnected':
            break
          case 'connected':
            fusion.dispose()
            break
          case 'error':
            done(new Error('Got an error in socket status'))
            break
          case 'disconnected':
            done()
            break
          default:
            done(new Error(`Received unknown status type ${stat.type}`))
          }
        },
        () => done(new Error('Got an error in status'))
      )
      fusion.connect(err => done(err))
    })

    it('errors when it gets the wrong host', done => {
      // Note -- the connection string specifies a bad host.
      const fusion = Fusion('wrong_host', { secure: false })
      assert.isDefined(fusion)
      let val = 0
      fusion.status().subscribe(status => {
        if (status.type === 'unconnected') {
          assert.equal(val, 0)
          assert.deepEqual(status, { type: 'unconnected' })
          val += 1
        } else if (status.type === 'error') {
          assert.equal(val, 1)
          assert.deepEqual(status, { type: 'error' })
          val += 1
        } else if (status.type === 'disconnected') {
          assert.equal(val, 2)
          assert.deepEqual(status, { type: 'disconnected' })
          done()
        } else {
          done(new Error(`Got unexpected status: ${status.type}`))
        }
      })
      fusion.connect(() => {}) // no-op error handler, already covered
    })
  })
}
