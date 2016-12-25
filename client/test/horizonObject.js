'use strict'

// Test object creation, the `disconnect` method, and `connected/disconnected`
// events.

function doneWrap(done) {
  let alreadyDone = false
  return (...args) => {
    if (!alreadyDone) {
      alreadyDone = true
      return done(...args)
    }
  }
}

export default function horizonObjectSuite() {
  describe('Horizon', () => {
    it('connects and can track its status', done => {
      let oneDone = doneWrap(done)
      Horizon.clearAuthTokens()
      const horizon = Horizon({secure: false})
      assert.isDefined(horizon)
      horizon.status(
        stat => {
          switch (stat.type) {
          case 'unconnected':
            break
          case 'ready':
            horizon.disconnect()
            break
          case 'error':
            oneDone(new Error('Got an error in socket status'))
            break
          case 'disconnected':
            oneDone()
            break
          default:
            oneDone(new Error(`Received unknown status type ${stat.type}`))
          }
        },
        () => oneDone(new Error('Got an error in status'))
      )
      horizon.connect(err => oneDone(err))
    })

    it('errors when it gets the wrong host', done => {
      // Note -- the connection string specifies a bad host.
      const horizon = Horizon({
        host: 'wrong_host',
        secure: false,
      })
      assert.isDefined(horizon)
      horizon.status().take(3).toArray().subscribe(statuses => {
        const expected = [
          {type: 'disconnected'},
          {type: 'error'}, // socket
          {type: 'disconnected'},
        ]
        assert.deepEqual(expected, statuses)
        done()
      })
      horizon.connect() // no-op error handler, already covered
    })
  })
}
