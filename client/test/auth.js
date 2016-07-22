import 'rxjs/add/operator/do'
import 'rxjs/add/operator/mergeMap'
import 'rxjs/add/operator/mergeMapTo'

const authSuite = global.authSuite = (getHorizon) => () => {
  let horizon
  before(() => {
    horizon = getHorizon()
  })
  it('gets an empty object when unauthenticated', done => {
    horizon.currentUser().fetch().subscribe({
      next(user) {
        assert.isObject(user)
        assert.deepEqual([], Object.keys(user))
      },
      error(err) { done(err) },
      complete() { done() },
    })
  })
  it('gets a normal user object when anonymous', done => {
    const myHorizon = Horizon({
      secure: false,
      lazyWrites: true,
      authType: 'anonymous'
    })
    Horizon.clearAuthTokens()
    myHorizon.connect()
    myHorizon.currentUser().fetch().subscribe({
      next(user) {
        assert.isObject(user)
        assert.isString(user.id)
        assert.sameDeepMembers(user.groups, [ 'default', 'authenticated' ])
      },
      error: done,
      complete: done,
    })
  })
  it('write to the user object', done => {
    const myHorizon = Horizon({ secure: false, lazyWrites: true, authType: 'anonymous' })
    const new_groups = [ 'admin', 'superuser', 'default' ];
    Horizon.clearAuthTokens()
    myHorizon.connect()
    myHorizon.currentUser().fetch()
      .do() // TODO: why does this only work with a `tap`?
      .mergeMap(user => myHorizon('users').update({ id: user.id, groups: [ 'admin', 'superuser', 'default' ] }))
      .mergeMapTo(myHorizon.currentUser().fetch()).subscribe({
        next(user) {
          assert.isObject(user)
          assert.isString(user.id)
          assert.sameDeepMembers(user.groups, new_groups)
        },
        error: done,
        complete: done,
      })
  })
}
