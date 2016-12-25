import 'rxjs/add/operator/do'
import 'rxjs/add/operator/mergeMap'
import 'rxjs/add/operator/mergeMapTo'

export default function authSuite(getHorizon) {
  return () => {
  let horizon
  before(() => {
    horizon = getHorizon()
  })
  it('gets an error when unauthenticated', done => {
    const unauthHorizon = Horizon({
      secure: false,
      lazyWrites: true,
      authType: 'unauthenticated',
    })
    unauthHorizon.currentUser().fetch().subscribe({
      next(user) {
        throw new Error('Expected an error, got a document')
      },
      error(err) {
        assert.equal(err.message, 'Unauthenticated users have no user document.')
        done()
      },
      complete() {
        throw new Error('Expected an error, completed successfully instead')
      },
    })
  })
  it('gets a normal user object when anonymous', done => {
    Horizon.clearAuthTokens()
    const myHorizon = Horizon({
      secure: false,
      lazyWrites: true,
      authType: 'anonymous',
    })
    let asserted = 0
    myHorizon.currentUser().fetch().subscribe({
      next(user) {
        assert.isObject(user)
        assert.isString(user.id)
        assert.sameDeepMembers(user.groups, ['default', 'authenticated'])
        asserted += 1
      },
      error(e) { done(e) },
      complete() {
        if (asserted < 1) {
          done(new Error('Completed before receiving a document'))
        } else if (asserted > 1) {
          done(new Error('Received too many documents before completing'))
        } else {
          done()
        }
      },
    })
  })
  it('write to the user object', done => {
    Horizon.clearAuthTokens()
    const myHorizon = Horizon({secure: false, lazyWrites: true, authType: 'anonymous'})
    const new_groups = ['admin', 'superuser', 'default'];
    let asserted = 0
    myHorizon.currentUser().fetch()
      .mergeMap(user => myHorizon('users')
                .update({id: user.id, groups: ['admin', 'superuser', 'default']}))
      .mergeMapTo(myHorizon.currentUser().fetch()).subscribe({
        next(user) {
          assert.isObject(user)
          assert.isString(user.id)
          assert.sameDeepMembers(user.groups, new_groups)
          asserted += 1
        },
        error(e) { done(e) },
        complete() {
          if (asserted < 1) {
            done(new Error('Completed before receiving a document'))
          } else if (asserted > 1) {
            done(new Error('Received too many documents before completing'))
          } else {
            done()
          }
        },
      })
  })
}}
