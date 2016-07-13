import { toArray } from 'rxjs/operator/toArray'
import { take } from 'rxjs/operator/take'

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

var horizonObjectSuite = global.horizonObjectSuite = () => {
  describe('Horizon', () => {
    it('connects and can track its status', done => {
      let oneDone = doneWrap(done)
      Horizon.clearAuthTokens()
      const horizon = Horizon({ secure: false })
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
        secure: false
      })
      assert.isDefined(horizon)
      let val = 0
      horizon.status()::take(3)::toArray().subscribe(status => {
        assert.deepEqual(status, [
          { type: 'unconnected' },
          { type: 'error' },
          { type: 'disconnected' },
        ])
        done()
      })
      horizon.connect(() => {}) // no-op error handler, already covered
    })
  })
}
